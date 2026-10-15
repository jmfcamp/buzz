// NIP-46 remote signer client. The user's secret key NEVER enters this page: it lives in the remote signer
// (nsec.app, Amber, Primal, a bunker...). We hold only an ephemeral *client* keypair that identifies this browser to
// the signer over the signer's own relay(s). Requests/responses are kind 24133 events encrypted with NIP-44
// (NIP-04 only if the signer answers in NIP-04).
import { desktopSignerActive, onDirectSignerChange } from "./directRoute";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip04,
  nip44,
  verifyEvent,
} from "nostr-tools";
import { bytesToHex, hexToBytes } from "nostr-tools/utils";
import {
  PENDING_TTL_MS,
  type PendingConnect,
  clearNip46Session,
  clearPendingConnect,
  loadNip46Session,
  loadPendingConnect,
  saveNip46Session,
  savePendingConnect,
} from "./nip46Store";
import { nip46Debug, nlog, short } from "./nip46Debug";
import { signerHealth } from "./signerHealth";
import { signerStatus } from "./signerStatus";
import {
  type SignedEvent,
  type Signer,
  SignerUnavailableError,
  type UnsignedEvent,
} from "./types";

export const NIP46_AVAILABLE = true;
export const NIP46_KIND = 24133;
// Our own signer relay first (kind 24133 only, no storage, rate limited; see deploy/signer-relay), then Primal's relay as
// the fallback, and relay.nsec.app for nsec.app bunkers. Fewer relays = fewer duplicate sockets per request; after the
// first answers, pruneSignerRelays keeps only the ones the signer actually uses (+ the Primal fallback).
export const HULA_SIGNER_RELAY = "wss://signer.huladesk.com";
export const DEFAULT_SIGNER_RELAYS = [HULA_SIGNER_RELAY, "wss://relay.primal.net", "wss://relay.nsec.app"];
const REQUEST_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 120_000; // bunker connect / get_public_key
const AUTH_URL_TIMEOUT_MS = 180_000; // user is approving in a browser tab / signer app
const HANDSHAKE_METHODS = new Set(["connect", "get_public_key"]);
/** Dead-socket detection: a REQ probe must reach EOSE within PING_DEADLINE_MS. Kind 24133 is ephemeral (relays never store
 *  it), so a reply that lands while we have no live socket is gone: sockets are replaced only when a probe proves them dead. */
const PING_EVERY_MS = 25_000;
const PING_DEADLINE_MS = 6_000;
const RETURN_PING_DEADLINE_MS = 2_500;
/** After a request is answered, the relays that carried answers are remembered; the saved session keeps those + one fallback. */
export const FALLBACK_SIGNER_RELAY = "wss://relay.primal.net";
export function pruneSignerRelays(current: string[], answeredOn: Iterable<string>): string[] {
  const answered = [...new Set(answeredOn)].filter((r) => current.includes(r));
  if (!answered.length) return current;
  const keep = answered.slice(0, 2);
  const fallback = current.includes(FALLBACK_SIGNER_RELAY) && !keep.includes(FALLBACK_SIGNER_RELAY)
    ? FALLBACK_SIGNER_RELAY
    : current.find((r) => !keep.includes(r));
  if (fallback && keep.length < 3) keep.push(fallback);
  return keep;
}

// Plain methods plus explicit per-kind sign_event grants: some signers (Primal) only pre-approve kinds that are named.
// Kinds Buzz web signs: auth 22242, HTTP auth 27235, profile 0, notes 1, deletes 5, reactions 7, chat 9, join/leave 9021/9022,
// community profile 9033, reports 1984, presence/typing 20001/20002, app data 30078 (settings/read state), emoji 30030,
// reminders 30300, status 30315, community pins/bots/sections 30623-30625, Blossom media auth 24242 (relay avatars/images),
// forum/workflow kinds 40002/40003/40008/45001/45003.
export const SIGN_KINDS = [22242, 27235, 9, 7, 0, 1, 5, 9021, 9022, 9033, 1984, 20001, 20002, 30078, 30030, 30300, 30315, 30623, 30624, 30625, 24242, 40002, 40003, 40008, 45001, 45003];
// The kinds named in the nostrconnect:// / connect perms. Frozen at the set Primal iOS is known to accept: adding kinds it
// doesn't recognise (24242 Blossom auth, 40002/40003/40008/45001/45003 forum/workflow — #244) left new PWA installs stuck at
// "Waiting for your signer…" (Primal is known to silently drop kinds it does not recognise; the pairing never came back). Kinds outside this list are still signed via the
// plain `sign_event` grant (the signer prompts per request), so DON'T extend this without re-testing a fresh Primal pairing.
export const PAIRING_PERM_KINDS = [22242, 27235, 9, 7, 0, 1, 5, 9021, 9022, 9033, 1984, 20001, 20002, 30078, 30030, 30300, 30315, 30623, 30624, 30625];
export const NOSTRCONNECT_PERMS = [
  "get_public_key",
  "sign_event",
  "nip44_encrypt",
  "nip44_decrypt",
  ...PAIRING_PERM_KINDS.map((k) => `sign_event:${k}`),
].join(",");

export type Nip46Session = {
  kind: "nip46";
  clientSecret: string; // hex; ephemeral CLIENT key for the NIP-46 channel only (not the user's identity)
  remotePubkey: string;
  relays: string[];
  userPubkey: string;
};

export type Nip46ErrorCode =
      | "timeout"
      | "rejected"
      | "bad-uri"
      | "unreachable"
      | "protocol";
export class Nip46Error extends Error {
  code: Nip46ErrorCode;
  constructor(code: Nip46ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "Nip46Error";
  }
}

export type BunkerParams = {
  remotePubkey: string;
  relays: string[];
  secret?: string;
};
export function parseBunkerUrl(input: string): BunkerParams {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new Nip46Error("bad-uri", "That doesn't look like a bunker:// URL.");
  }
  if (u.protocol !== "bunker:")
    throw new Nip46Error("bad-uri", "Expected a URL starting with bunker://");
  const remotePubkey = (
    u.hostname || u.pathname.replace(/^\/+/, "")
  ).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(remotePubkey))
    throw new Nip46Error(
      "bad-uri",
      "bunker:// URL has no valid signer public key.",
    );
  const relays = u.searchParams
    .getAll("relay")
    .filter((r) => /^wss?:\/\//.test(r));
  if (!relays.length)
    throw new Nip46Error("bad-uri", "bunker:// URL has no relay= parameter.");
  return {
    remotePubkey,
    relays,
    secret: u.searchParams.get("secret") ?? undefined,
  };
}

export function buildNostrConnectUri(
  clientPubkey: string,
  relays: string[],
  secret: string,
): string {
  const p = new URLSearchParams();
  for (const r of relays) p.append("relay", r);
  p.set("secret", secret);
  p.set("name", "Buzz");
  p.set("url", location.origin);
  p.set("perms", NOSTRCONNECT_PERMS);
  return `nostrconnect://${clientPubkey}?${p.toString().replace(/\+/g, "%20")}`;
}

type Waiter = { resolve: (r: string) => void; reject: (e: Error) => void };
type Pending = {
  id: string;
  /** dedupe key (method + params): an identical request attaches here instead of sending again */
  key: string;
  /** callers still waiting; an aborted caller leaves, the request lives on until its own deadline so a late reply still
   *  resolves whoever attached since (e.g. the wrapper's retry) */
  waiters: Set<Waiter>; // request id inside the encrypted payload (responses are matched on this)
  event: { id: string; [k: string]: unknown }; // the wire event, republished on reconnect
  resolve: (r: string) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
  /** resent as a fresh event after an app return (at most once) */
  returnResent?: boolean;
  params: string[];
  /** sockets this request was already published on: a request goes to each signer relay ONCE (no multiplied load). */
  sentOn: WeakSet<WebSocket>;
  at: number;
  rechecked?: boolean;
  /** how many times a FRESH wire event (new event id, same request id) was published for this request */
  resends: number;
  lastSentAt: number;
  timeoutMs: number;
};
type RelayConn = {
  url: string;
  ws: WebSocket | null;
  retry: number;
  timer?: ReturnType<typeof setTimeout>;
  /** outstanding liveness probe on the current socket */
  ping?: { id: string; deadline: ReturnType<typeof setTimeout>; done: (alive: boolean) => void };
  pingSeq: number;
};

/** Low-level NIP-46 transport: signer relays, reconnect, resubscribe, request/response matching. */
export class Nip46Client {
  readonly clientPubkey: string;
  private clientSk: Uint8Array;
  private conns: RelayConn[] = [];
  private pending = new Map<string, Pending>();
  private seen = new Set<string>();
  private closed = false;
  private useNip04 = false;
  private since = Math.floor(Date.now() / 1000) - 30;
  /** true while a nostrconnect:// handshake is pending: sockets are force-reopened on every foreground. */
  handshake = false;
  /** Desktop-bunker channel (desktopBunker.ts): never parks for the desktop signer (it IS the desktop signer) and doesn't
   *  drive the remote-signer health banner / pending toasts (that client reports its own status). */
  quiet = false;
  /** Used by nostrconnect:// to receive the unsolicited connect response. */
  onUnsolicited?: (ev: { pubkey: string; content: string; id: string }) => void;
  private hiddenAt = 0;
  private watchdog?: ReturnType<typeof setInterval>;
  /** relays that delivered a reply from our signer (session relay pruning) */
  readonly answeredOn = new Set<string>();
  /** called after the first reply on a relay not yet in answeredOn */
  onRelayAnswered?: (url: string) => void;
  private onVis = () => {
    if (document.visibilityState === "hidden") {
      this.hiddenAt = Date.now();
      return;
    }
    const away = this.hiddenAt ? Date.now() - this.hiddenAt : 0;
    this.hiddenAt = 0;
    void this.resumeFromBackground(away);
  };
  /**
   * Back from the background (iOS: from Primal): keep every socket that answers a probe, replace only the dead ones, and
   * re-send each still-unanswered request ONCE as a fresh event (the signer may have dropped the original while we were away).
   */
  private async resumeFromBackground(away: number) {
    if (this.closed) return;
    if (this.handshake) {
      // nostrconnect pairing: the signer may only now be listening; a fresh socket set is cheap and nothing is in flight.
      this.reconnectAll(true);
      return;
    }
    if (this.dormant()) {
      this.park();
      return;
    }
    const alive = await Promise.all(this.conns.map((c) => this.probe(c, RETURN_PING_DEADLINE_MS)));
    nlog(`foreground: ${alive.filter(Boolean).length}/${alive.length} signer sockets alive`);
    if (this.pending.size && away > 1500) {
      const live = this.conns.some((c) => c.ws?.readyState === WebSocket.OPEN);
      if (live) void this.resendPending("foreground", true, true);
      else this.resendOnNextOpen = true;
    }
  }
  private resendOnNextOpen = false;
  /** Paired desktop signs over Direct and nothing is waiting on us: no sockets, keepalive or probes (lazy wake-up). */
  private dormant(): boolean {
    return !this.quiet && !this.handshake && this.pending.size === 0 && desktopSignerActive();
  }
  /** Close every socket without scheduling a retry; request() reopens them on demand (onopen publishes pending). */
  private park() {
    let closed = 0;
    for (const c of this.conns) {
      clearTimeout(c.timer);
      c.timer = undefined;
      if (c.ping) (c as RelayConn & { pingFinish?: (alive: boolean) => void }).pingFinish?.(true);
      const ws = c.ws;
      if (!ws) continue;
      c.ws = null;
      closed++;
      try {
        ws.close();
      } catch {}
      nip46Debug.setRelay(c.url, false);
    }
    if (closed) nlog(`desktop signer active: remote signer sockets parked (${closed})`);
  }
  private offDirect?: () => void;
  /** Every 25s while visible: reopen CLOSED sockets and probe open ones; a socket is replaced only if its probe fails. */
  private health = () => {
    if (this.closed || document.visibilityState !== "visible") return;
    if (this.dormant()) {
      this.park();
      signerHealth.desktopCovered();
      return;
    }
    for (const c of this.conns) {
      if (!c.timer && (!c.ws || c.ws.readyState === WebSocket.CLOSED)) this.open(c);
      else if (c.ws?.readyState === WebSocket.OPEN && !c.ping) void this.probe(c, PING_DEADLINE_MS);
    }
    const now = Date.now();
    // Handshake requests (connect/get_public_key) that stay unanswered get a fresh event with backoff (20s, 40s, 60s…).
    if ([...this.pending.values()].some((p) => HANDSHAKE_METHODS.has(p.method) && now - p.lastSentAt > Math.min(60_000, 20_000 * 2 ** p.resends)))
      void this.resendPending("backoff", false);
  };
  /**
   * Liveness probe: a REQ that matches nothing must come back as EOSE. Resolves true for a live socket. A socket that misses
   * the deadline is dead (iOS froze it while it still claims OPEN): it is replaced, and any reply it would have carried was
   * already lost, so pending requests are re-published on the new one.
   */
  private probe(c: RelayConn, deadlineMs: number): Promise<boolean> {
    const ws = c.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (!c.timer && (!ws || ws.readyState === WebSocket.CLOSED)) this.open(c);
      return Promise.resolve(false);
    }
    if (c.ping) {
      const prev = c.ping;
      return new Promise((resolve) => {
        const done = prev.done;
        prev.done = (alive) => {
          done(alive);
          resolve(alive);
        };
      });
    }
    return new Promise((resolve) => {
      const id = `ping${++c.pingSeq}`;
      const finish = (alive: boolean) => {
        if (!c.ping || c.ping.id !== id) return;
        clearTimeout(c.ping.deadline);
        const done = c.ping.done;
        c.ping = undefined;
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify(["CLOSE", id]));
          } catch {}
        }
        if (!alive && c.ws === ws) {
          nlog("signer socket failed its probe: replacing", { relay: c.url });
          this.replace(c);
        }
        done(alive);
      };
      c.ping = { id, deadline: setTimeout(() => finish(false), deadlineMs), done: resolve };
      try {
        ws.send(JSON.stringify(["REQ", id, { kinds: [NIP46_KIND], "#p": [this.clientPubkey], since: Math.floor(Date.now() / 1000) + 3600, limit: 1 }]));
      } catch {
        finish(false);
      }
      (c as RelayConn & { pingFinish?: (alive: boolean) => void }).pingFinish = finish;
    });
  }
  private replace(c: RelayConn) {
    clearTimeout(c.timer);
    c.timer = undefined;
    const old = c.ws;
    c.ws = null;
    try {
      old?.close();
    } catch {}
    c.retry = 0;
    this.open(c);
  }

  /** Re-sign and republish every pending request as a NEW event (same request id, so either answer matches). */
  async resendPending(why: string, extendDeadline: boolean, oncePerRequest = false) {
    if (this.closed || !this.remotePubkey) return;
    for (const p of [...this.pending.values()]) {
      if (why === "backoff" && !HANDSHAKE_METHODS.has(p.method)) continue;
      if (oncePerRequest) {
        if (p.returnResent || Date.now() - p.lastSentAt < 3000) continue;
        p.returnResent = true;
      }
      try {
        const content = await this.encrypt(this.remotePubkey, JSON.stringify({ id: p.id, method: p.method, params: p.params }));
        p.event = finalizeEvent(
          { kind: NIP46_KIND, created_at: Math.floor(Date.now() / 1000), tags: [["p", this.remotePubkey]], content },
          this.clientSk,
        ) as unknown as Pending["event"];
      } catch {
        continue;
      }
      if (!this.pending.has(p.id)) continue;
      p.resends++;
      p.lastSentAt = Date.now();
      p.sentOn = new WeakSet();
      if (extendDeadline) {
        clearTimeout(p.timer);
        p.timer = setTimeout(() => this.fail(p, "timeout"), p.timeoutMs);
        p.at = Date.now();
        p.rechecked = false;
      }
      nlog(`re-sending ${p.method} as a fresh event (${why}, #${p.resends})`);
      for (const c of this.conns)
        if (c.ws?.readyState === WebSocket.OPEN) {
          p.sentOn.add(c.ws);
          c.ws.send(JSON.stringify(["EVENT", p.event]));
        }
    }
  }

  remotePubkey: string | null;
  relays: string[];
  constructor(
    clientSecretHex: string,
    remotePubkey: string | null,
    relays: string[],
    since?: number,
  ) {
    this.remotePubkey = remotePubkey;
    this.relays = relays;
    if (since !== undefined) this.since = since;
    this.clientSk = hexToBytes(clientSecretHex);
    this.clientPubkey = getPublicKey(this.clientSk);
  }
  get clientSecret() {
    return bytesToHex(this.clientSk);
  }

  start() {
    this.closed = false;
    this.conns = this.relays.map((url) => ({ url, ws: null, retry: 0, pingSeq: 0 }));
    if (!this.dormant()) for (const c of this.conns) this.open(c);
    this.offDirect?.();
    // Desktop signer came or went: park now, or wake the sockets so the remote signer is ready again.
    this.offDirect = onDirectSignerChange(() => queueMicrotask(() => this.onDirectChange()));
    document.addEventListener("visibilitychange", this.onVis);
    window.addEventListener("online", this.onVis);
    window.addEventListener("pageshow", this.onVis);
    clearInterval(this.watchdog);
    this.watchdog = setInterval(this.health, PING_EVERY_MS);
  }
  private onDirectChange() {
    if (this.closed) return;
    if (this.dormant()) return; // health() parks on its next tick once the desktop is actually live + paired
    for (const c of this.conns) if (!c.ws && !c.timer) this.open(c);
  }
  stop() {
    this.closed = true;
    this.offDirect?.();
    this.offDirect = undefined;
    clearInterval(this.watchdog);
    document.removeEventListener("visibilitychange", this.onVis);
    window.removeEventListener("online", this.onVis);
    window.removeEventListener("pageshow", this.onVis);
    for (const c of this.conns) {
      clearTimeout(c.timer);
      try {
        c.ws?.close();
      } catch {}
      c.ws = null;
    }
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      for (const w of p.waiters) w.reject(new Nip46Error("unreachable", "Signer connection closed."));
      this.pending.delete(id);
    }
    if (!this.quiet) signerStatus.set({ pending: 0, authUrl: null });
  }

  /** iOS/Android suspend background sockets; on foreground drop dead ones, reopen, resubscribe with `since`. */
  reconnectAll(force = false) {
    if (this.closed) return;
    nlog(`foreground/online: reconnecting signer relays${force ? " (forced)" : ""}`);
    for (const c of this.conns) {
      // A socket iOS froze in the background can still claim OPEN; after being away (force) or during the handshake replace it.
      if (!force && !this.handshake && c.ws && c.ws.readyState !== WebSocket.CLOSED)
        continue;
      // Never drop a socket that may be carrying a reply: with requests in flight, a forced rebuild only replaces sockets that
      // fail a probe (see probe()). Pairing (handshake) and an idle client may rebuild freely.
      if (force && !this.handshake && this.pending.size && c.ws?.readyState === WebSocket.OPEN) {
        void this.probe(c, RETURN_PING_DEADLINE_MS);
        continue;
      }
      this.replace(c);
    }
  }

  private open(c: RelayConn) {
    if (this.closed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(c.url);
    } catch {
      return this.scheduleRetry(c);
    }
    c.ws = ws;
    ws.onopen = () => {
      c.retry = 0;
      nip46Debug.setRelay(c.url, true);
      nlog(`relay open, subscribing since=${this.since}`, { relay: c.url });
      ws.send(
        JSON.stringify([
          "REQ",
          "nip46",
          { kinds: [NIP46_KIND], "#p": [this.clientPubkey], since: this.since },
        ]),
      );
      if (this.resendOnNextOpen) {
        this.resendOnNextOpen = false;
        void this.resendPending("foreground", true, true);
      } else if (this.quiet && this.pending.size) {
        // Desktop bunker: the Hula signer relay stores nothing, so a reply sent while this socket was down is gone, and the
        // desktop ignores a re-published event id it already answered. Re-send pending requests as FRESH events.
        void this.resendPending("reopen", false);
        return;
      }
      // (re)publish anything still waiting: it may have been sent into a dead socket
      for (const p of this.pending.values())
        if (!p.sentOn.has(ws)) {
          p.sentOn.add(ws);
          ws.send(JSON.stringify(["EVENT", p.event]));
        }
    };
    ws.onmessage = (m) => {
      const raw = String(m.data);
      // Any inbound frame proves the socket alive; EOSE for our probe settles it.
      if (c.ping && c.ws === ws) {
        const fin = (c as RelayConn & { pingFinish?: (alive: boolean) => void }).pingFinish;
        if (raw.startsWith('["EOSE"') || raw.startsWith('["CLOSED"') || raw.startsWith('["EVENT"')) fin?.(true);
      }
      void this.onMsg(raw, c.url);
    };
    ws.onclose = () => {
      if (c.ping) (c as RelayConn & { pingFinish?: (alive: boolean) => void }).pingFinish?.(false);
      if (c.ws === ws) {
        nip46Debug.setRelay(c.url, false);
        this.scheduleRetry(c);
      }
    };
    ws.onerror = () => {};
  }
  private scheduleRetry(c: RelayConn) {
    if (this.closed) return;
    if (this.dormant()) {
      c.ws = null;
      return;
    }
    // iOS kills every socket a backgrounded PWA opens (0s, code 1006), so retrying while hidden is a reconnect storm into
    // the signer relay's per-IP limits. Wait: onVis/resumeFromBackground reopens on return.
    if (typeof document !== "undefined" && document.visibilityState === "hidden" && !this.pending.size) {
      c.ws = null;
      return;
    }
    c.retry++;
    c.timer = setTimeout(
      () => this.open(c),
      Math.min(15_000, 500 * 2 ** Math.min(c.retry, 5)),
    );
  }

  private async decrypt(peer: string, content: string): Promise<string> {
    // NIP-04 payloads contain "?iv="; NIP-44 are plain base64. Try the likely one first, then the other.
    const tryNip04 = async () => {
      const t = await nip04.decrypt(this.clientSk, peer, content);
      this.useNip04 = true;
      nlog("decrypt ok (nip04)");
      return t;
    };
    const tryNip44 = () => {
      const t = nip44.v2.decrypt(
        content,
        nip44.v2.utils.getConversationKey(this.clientSk, peer),
      );
      nlog("decrypt ok (nip44)");
      return t;
    };
    const order = content.includes("?iv=")
      ? [tryNip04, tryNip44]
      : [tryNip44, tryNip04];
    let last: unknown;
    for (const f of order) {
      try {
        return await f();
      } catch (e) {
        last = e;
      }
    }
    nlog("decrypt FAILED (nip44 and nip04)");
    throw last;
  }
  private async onMsg(raw: string, relayUrl?: string) {
    let msg: unknown[];
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg[0] !== "EVENT") return;
    const ev = msg[2] as {
      id: string;
      pubkey: string;
      content: string;
      kind: number;
      sig: string;
    };
    if (!ev || ev.kind !== NIP46_KIND || this.seen.has(ev.id)) return;
    this.seen.add(ev.id);
    nlog(`event received kind=${ev.kind} from=${short(ev.pubkey)}`);
    nip46Debug.event(`kind ${ev.kind} from ${short(ev.pubkey)}`);
    if (!verifyEvent(ev as never)) {
      nlog("event dropped: bad signature");
      return;
    }
    if (this.remotePubkey && ev.pubkey !== this.remotePubkey) {
      nlog("event dropped: not from our signer");
      return; // ignore strangers
    }
    let body: { id?: string; result?: string; error?: string; method?: string };
    try {
      body = JSON.parse(await this.decrypt(ev.pubkey, ev.content));
    } catch {
      return;
    }
    if (this.remotePubkey && ev.pubkey === this.remotePubkey && relayUrl && !this.answeredOn.has(relayUrl)) {
      this.answeredOn.add(relayUrl);
      this.onRelayAnswered?.(relayUrl);
    }
    const p = body.id ? this.pending.get(body.id) : undefined;
    if (!p) {
      if (!this.remotePubkey && !body.method)
        this.onUnsolicited?.({
          pubkey: ev.pubkey,
          id: ev.id,
          content: JSON.stringify(body),
        });
      return;
    }
    if (body.result === "auth_url" && body.error) {
      // Signer wants the user to approve in a browser/app. Keep waiting, with a longer deadline.
      this.openAuthUrl(body.error);
      clearTimeout(p.timer);
      p.timer = setTimeout(() => this.fail(p, "timeout"), AUTH_URL_TIMEOUT_MS);
      return;
    }
    clearTimeout(p.timer);
    this.pending.delete(body.id as string);
    this.updateStatus();
    // A re-sent bunker connect can be answered "secret already used" because the signer accepted an earlier copy: treat it as
    // connected; finish()'s get_public_key round trip proves we're actually authorized.
    if (body.error && p.method === "connect" && p.resends > 0 && /secret|already/i.test(body.error)) {
      nlog(`connect re-send answered "${body.error}": treating as connected, verifying via get_public_key`);
      if (!this.quiet) signerHealth.success();
      for (const w of p.waiters) w.resolve("ack");
      return;
    }
    if (body.error) {
      if (!this.quiet) signerHealth.error(body.error);
      for (const w of p.waiters) w.reject(new Nip46Error("rejected", body.error));
    } else {
      if (!this.quiet) signerHealth.success();
      for (const w of p.waiters) w.resolve(body.result ?? "");
    }
  }
  private openAuthUrl(url: string) {
    if (!/^https?:\/\//i.test(url)) return;
    signerStatus.set({ authUrl: url });
    try {
      window.open(url, "_blank", "noopener"); // may be blocked on iOS (no user gesture); the status toast has a tap-to-open link
    } catch {}
  }
  private fail(p: Pending, code: "timeout") {
    this.pending.delete(p.id);
    // Nobody waiting any more (every caller aborted): the wrapper already reported its own timeout; don't double-count.
    if (p.waiters.size && !this.quiet) signerHealth.timeout({ background: /crypt/.test(p.method) });
    this.updateStatus();
    const err = new Nip46Error(
      code,
      `Your signer didn't respond to "${p.method}". Open your signer app and try again.`,
    );
    for (const w of p.waiters) w.reject(err);
  }
  private updateStatus() {
    if (this.quiet) return;
    signerStatus.set({
      pending: this.pending.size,
      authUrl: this.pending.size ? signerStatus.get().authUrl : null,
    });
  }

  private async encrypt(peer: string, text: string): Promise<string> {
    return this.useNip04
      ? await nip04.encrypt(this.clientSk, peer, text)
      : nip44.v2.encrypt(
          text,
          nip44.v2.utils.getConversationKey(this.clientSk, peer),
        );
  }

  /**
   * Send one request; resolves with the `result` string. ONE deadline per request (`timeoutMs`). `signal` cancels only this
   * caller's wait: the request stays live until its deadline, and an identical request (same method + params) attaches to it
   * instead of sending again, so a late reply still resolves the retry.
   */
  async request(
    method: string,
    params: string[],
    timeoutMs = REQUEST_TIMEOUT_MS,
    signal?: AbortSignal,
  ): Promise<string> {
    if (!this.remotePubkey)
      throw new Nip46Error("protocol", "No remote signer pubkey yet.");
    if (this.closed) this.start();
    if (signal?.aborted) throw new Nip46Error("timeout", "Cancelled.");
    const key = `${method}\0${JSON.stringify(params)}`;
    const attach = (p: Pending) =>
      new Promise<string>((resolve, reject) => {
        const w: Waiter = { resolve, reject };
        p.waiters.add(w);
        signal?.addEventListener(
          "abort",
          () => {
            if (!p.waiters.delete(w)) return;
            reject(new Nip46Error("timeout", `Your signer didn't respond to "${method}" in time.`));
          },
          { once: true },
        );
      });
    for (const p of this.pending.values()) if (p.key === key) return attach(p);
    const id = crypto.randomUUID();
    const content = await this.encrypt(
      this.remotePubkey,
      JSON.stringify({ id, method, params }),
    );
    const event = finalizeEvent(
      {
        kind: NIP46_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", this.remotePubkey]],
        content,
      },
      this.clientSk,
    );
    for (const p of this.pending.values()) if (p.key === key) return attach(p); // raced while encrypting
    const p: Pending = {
      id,
      key,
      waiters: new Set(),
      event: event as unknown as Pending["event"],
      resolve: () => {},
      reject: () => {},
      method,
      params,
      sentOn: new WeakSet(),
      at: Date.now(),
      resends: 0,
      lastSentAt: Date.now(),
      timeoutMs,
      timer: setTimeout(() => this.fail(p, "timeout"), timeoutMs),
    };
    this.pending.set(id, p);
    const result = attach(p);
    this.updateStatus();
    let sent = false;
    for (const c of this.conns)
      if (c.ws?.readyState === WebSocket.OPEN) {
        if (!p.sentOn.has(c.ws)) {
          p.sentOn.add(c.ws);
          c.ws.send(JSON.stringify(["EVENT", event]));
        }
        sent = true;
      }
    if (!sent) this.reconnectAll(); // reopens CLOSED sockets only; onopen publishes pending
    return result;
  }

  /**
   * nostrconnect://: wait until a signer answers our URI. Accepts result == secret or "ack"; a signer that returns an empty
   * result is accepted tentatively (finish() then proves it via get_public_key). A different non-empty result is ignored.
   */
  waitForConnect(
    secret: string,
    timeoutMs = CONNECT_TIMEOUT_MS,
    signal?: AbortSignal,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const done = () => {
        clearTimeout(t);
        this.onUnsolicited = undefined;
      };
      const t = setTimeout(() => {
        done();
        reject(
          new Nip46Error(
            "timeout",
            "No signer answered. Open the link in your signer app and approve the connection, then try again.",
          ),
        );
      }, Math.max(1000, timeoutMs));
      signal?.addEventListener("abort", () => {
        done();
        reject(new Nip46Error("protocol", "Cancelled."));
      });
      this.onUnsolicited = (ev) => {
        try {
          const b = JSON.parse(ev.content) as {
            result?: string;
            error?: string;
          };
          if (b.error) {
            nlog(`connect response: error from ${short(ev.pubkey)}`);
            done();
            return reject(new Nip46Error("rejected", b.error));
          }
          if (b.result === secret || b.result === "ack" || !b.result) {
            nlog(
              `connect response ok from ${short(ev.pubkey)} (${
                b.result === secret
                  ? "secret echoed"
                  : b.result === "ack"
                    ? "ack"
                    : "empty result; will verify via get_public_key"
              })`,
            );
            done();
            resolve(ev.pubkey);
          } else {
            nlog("connect response ignored: result != secret/ack (bad secret)");
          }
        } catch {}
      };
    });
  }
}

let currentClient: Nip46Client | null = null;
/** Client of an in-flight bunker sign-in, so the unlock screen's "Try again" can re-send without a page refresh. */
let handshakeClient: Nip46Client | null = null;
export function nudgeSignerHandshake() {
  const c = handshakeClient;
  if (!c) return false;
  c.reconnectAll(true);
  void c.resendPending("manual", true);
  return true;
}

/**
 * Boot/mid-session liveness probe: a real round trip (get_public_key must come back as the saved pubkey) within `timeoutMs`.
 * On a miss it rebuilds the signer relay sockets and tries once more before reporting failure.
 */
export async function probeNip46(userPubkey: string, timeoutMs = 8000, onAttempt?: (attempt: number, timeoutMs: number) => void): Promise<{ ok: true } | { ok: false; reason: "timeout" | "revoked" | "mismatch" | "no-client" }> {
  const c = currentClient;
  if (!c) return { ok: false, reason: "no-client" };
  signerHealth.reconnecting(true);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 1) c.reconnectAll(true);
      onAttempt?.(attempt, timeoutMs);
      try {
        const pk = await c.request("get_public_key", [], timeoutMs);
        if (pk !== userPubkey) return { ok: false, reason: "mismatch" };
        signerHealth.success();
        return { ok: true };
      } catch (e) {
        if (e instanceof Nip46Error && e.code === "rejected") return { ok: false, reason: "revoked" };
        // timeout or unreachable: retry once after reconnecting sockets
      }
    }
    return { ok: false, reason: "timeout" };
  } finally {
    signerHealth.reconnecting(false);
  }
}

export function createNip46SignerFromClient(
  client: Nip46Client,
  userPubkey: string,
): Signer & { client: Nip46Client } {
  currentClient = client;
  // Session relay pruning: once the signer has answered, keep only the relays it answers on (+1 fallback). Applies from the
  // next launch (live sockets are never dropped mid-session).
  client.onRelayAnswered = () => {
    const next = pruneSignerRelays(client.relays, client.answeredOn);
    if (!client.remotePubkey || next.join() === client.relays.join()) return;
    void saveNip46Session({
      kind: "nip46",
      clientSecret: client.clientSecret,
      remotePubkey: client.remotePubkey,
      relays: next,
      userPubkey,
    }).then(() => nlog(`signer relays pruned for next launch: ${next.join(", ")}`));
  };
  return {
    kind: "nip46",
    client,
    getPublicKey: async () => userPubkey,
    async signEvent(ev: UnsignedEvent, opts?: { signal?: AbortSignal }): Promise<SignedEvent> {
      const draft = {
        kind: ev.kind,
        content: ev.content,
        tags: ev.tags,
        created_at: ev.created_at ?? Math.floor(Date.now() / 1000),
      };
      const res = await client.request("sign_event", [JSON.stringify(draft)], REQUEST_TIMEOUT_MS, opts?.signal);
      let signed: SignedEvent;
      try {
        signed = JSON.parse(res);
      } catch {
        throw new Nip46Error("protocol", "Signer returned an invalid event.");
      }
      if (signed.pubkey !== userPubkey || !verifyEvent(signed as never))
        throw new Nip46Error(
          "protocol",
          "Signer returned an event signed by a different key or with a bad signature.",
        );
      if (signed.kind !== draft.kind || signed.content !== draft.content)
        throw new Nip46Error("protocol", "Signer modified the event.");
      return signed;
    },
    nip44: {
      encrypt: (peer, pt, signal) => client.request("nip44_encrypt", [peer, pt], REQUEST_TIMEOUT_MS, signal),
      decrypt: (peer, ct, signal) => client.request("nip44_decrypt", [peer, ct], REQUEST_TIMEOUT_MS, signal),
    },
  };
}

const newClientKey = () => bytesToHex(generateSecretKey());

async function finish(
  client: Nip46Client,
  relays: string[],
): Promise<Signer & { client: Nip46Client }> {
  nlog("sending get_public_key");
  const userPubkey = await client.request(
    "get_public_key",
    [],
    CONNECT_TIMEOUT_MS,
  );
  nlog(`get_public_key result ${short(userPubkey)}`);
  if (!/^[0-9a-f]{64}$/.test(userPubkey))
    throw new Nip46Error("protocol", "Signer returned an invalid public key.");
  await saveNip46Session({
    kind: "nip46",
    clientSecret: client.clientSecret,
    remotePubkey: client.remotePubkey as string,
    relays,
    userPubkey,
  });
  return createNip46SignerFromClient(client, userPubkey);
}

/** Flow (a): bunker://<remote-pubkey>?relay=..&secret=.. */
export async function connectBunker(
  bunkerUrl: string,
): Promise<Signer & { client: Nip46Client }> {
  const b = parseBunkerUrl(bunkerUrl);
  const client = new Nip46Client(newClientKey(), b.remotePubkey, b.relays);
  client.start();
  handshakeClient = client;
  try {
    const r = await client.request(
      "connect",
      [b.remotePubkey, b.secret ?? ""],
      CONNECT_TIMEOUT_MS,
    );
    if (b.secret && r !== "ack" && r !== b.secret)
      throw new Nip46Error(
        "protocol",
        "Signer answered the connect request with an unexpected secret.",
      );
    return await finish(client, b.relays);
  } catch (e) {
    client.stop();
    throw e;
  } finally {
    if (handshakeClient === client) handshakeClient = null;
  }
}

export type NostrConnectFlow = {
  uri: string;
  connected: Promise<Signer & { client: Nip46Client }>;
  resumed: boolean;
  expiresAt: number;
  /** Abort and forget the pending attempt (user pressed Cancel). */
  cancel: () => void;
  /** Stop listening but KEEP the pending attempt (component unmounted / page going away). */
  detach: () => void;
  client: Nip46Client;
};

function runNostrConnect(p: PendingConnect, resumed: boolean): NostrConnectFlow {
  const client = new Nip46Client(
    p.clientSecret,
    null,
    p.relays,
    p.createdAt - 60,
  );
  client.handshake = true;
  const uri = buildNostrConnectUri(client.clientPubkey, p.relays, p.secret);
  const abort = new AbortController();
  let detached = false;
  nip46Debug.forgetRelays();
  nlog(`${resumed ? "RESUMING" : "starting"} nostrconnect`, {
    relays: p.relays,
    client: short(client.clientPubkey),
    expiresInSec: Math.round((p.expiresAt - Date.now()) / 1000),
  });
  client.start();
  const connected = client
    .waitForConnect(p.secret, p.expiresAt - Date.now(), abort.signal)
    .then(async (remotePubkey) => {
      client.remotePubkey = remotePubkey;
      client.handshake = false;
      const signer = await finish(client, p.relays);
      await clearPendingConnect();
      return signer;
    })
    .catch(async (e) => {
      client.stop();
      if (!detached) {
        await clearPendingConnect();
        nlog(`nostrconnect failed: ${e instanceof Error ? e.message : e}`);
      }
      throw e;
    });
  return {
    uri,
    connected,
    resumed,
    expiresAt: p.expiresAt,
    client,
    cancel: () => abort.abort(),
    detach: () => {
      detached = true;
      abort.abort();
    },
  };
}

/**
 * Flow (b): we mint a nostrconnect:// URI; caller shows it as QR/deep link, then awaits `connected`.
 * The attempt is persisted before the URI is returned, and a still-valid pending attempt is REUSED (never a new keypair)
 * so a reload / tab discard while the user is in the signer app resumes instead of restarting.
 */
export async function beginNostrConnect(
  relays: string[] = DEFAULT_SIGNER_RELAYS,
  opts: { resumeOnly?: boolean } = {},
): Promise<NostrConnectFlow | null> {
  const existing = await loadPendingConnect();
  if (existing) return runNostrConnect(existing, true);
  if (opts.resumeOnly) return null;
  const p: PendingConnect = {
    clientSecret: newClientKey(),
    secret: bytesToHex(generateSecretKey()).slice(0, 32),
    relays,
    createdAt: Math.floor(Date.now() / 1000),
    expiresAt: Date.now() + PENDING_TTL_MS,
  };
  await savePendingConnect(p); // durable BEFORE the link is shown
  return runNostrConnect(p, false);
}
export { clearPendingConnect };

/** Resume from IndexedDB. No network needed up front: userPubkey is stored; sockets open on first use. */
export async function resumeNip46(): Promise<
  (Signer & { client: Nip46Client }) | null
> {
  const s = await loadNip46Session();
  if (!s) return null;
  const client = new Nip46Client(s.clientSecret, s.remotePubkey, s.relays);
  client.start();
  return createNip46SignerFromClient(client, s.userPubkey);
}

export async function forgetNip46(signer?: Signer | null) {
  (signer as { client?: Nip46Client } | null | undefined)?.client?.stop();
  await clearNip46Session();
  await clearPendingConnect();
}

// Back-compat with the slice-1 factory signature.
export function createNip46Signer(_bunkerUri: string): Signer {
  throw new SignerUnavailableError(
    "nip46-not-implemented",
    "Use connectBunker()/startNostrConnect().",
  );
}
