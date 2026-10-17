// Desktop side of "sign in on web with your desktop": a NIP-46 bunker (remote signer) built into the desktop app.
//  - Transport: kind 24133 events over the Hula signer relay (BUNKER_RELAY), NIP-44 encrypted with this desktop's bunker
//    TRANSPORT key (a separate keypair kept in this app's storage; never the account key).
//  - Pairing: Settings shows a one-time bunker:// code / QR (5 minutes, one browser). A browser that presents it in
//    `connect` gets an Allow/Deny prompt here; on Allow its NIP-46 client key is saved as a device (same list as Direct).
//  - Approved devices: relay auth, messages, reactions, read markers etc. are signed without asking; profile (0), follow
//    list (3) and deletes (5) always ask; every other kind is signed silently. NIP-44 encrypt/decrypt for the account is allowed (DMs,
//    synced settings) and logged.
//  - Revoked / unknown clients get an error (revoked) or nothing at all (unknown), and every client is rate limited.
// The account key is only used through deps.sign / deps.crypt and is never returned or exported.
import { sanitizeDeviceMeta } from "./deviceMeta";
import { finalizeEvent, getPublicKey, nip44, verifyEvent } from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  BUNKER_CODE_TTL_MS,
  BUNKER_RELAY,
  BUNKER_UNPAIR_METHOD,
  bunkerAutoKind,
  buildBunkerUri,
} from "./bunkerProto";
import type { SignerDeps, SignerDevice } from "./directSigner";

const KIND = 24133;
/** Requests older than this (relay replay, queued re-sends) are dropped without prompting. */
const STALE_REQ_SECS = 90;
const HEX64 = /^[0-9a-f]{64}$/;
const MAX_CONTENT = 256_000;
const MAX_TAGS = 2_000;

export class BunkerError extends Error {}

export type BunkerPolicyDeps = Pick<
  SignerDeps,
  "store" | "confirm" | "sign" | "crypt" | "now" | "randomHex"
> & {
  userPubkey(): Promise<string> | string;
};

type Code = { secret: string; expiresAt: number };
type Bucket = { tokens: number; at: number };

const KIND_NAMES: Record<number, string> = {
  0: "a profile update (kind 0)",
  3: "a follow list update (kind 3)",
  5: "a deletion (kind 5)",
};
const describeKind = (k: number) => KIND_NAMES[k] ?? `a kind ${k} event`;

/** Pure request policy (no sockets): testable with fakes. */
export function createBunkerPolicy(deps: BunkerPolicyDeps) {
  let code: Code | null = null;
  const buckets = new Map<string, Bucket>();
  const strangerBucket: Bucket = { tokens: 10, at: deps.now() };
  const devices = () => deps.store.devices();
  // One native dialog at a time: concurrent prompts stacked identical dialogs, so Allow looked like it did nothing.
  // Identical asks (same device + kind + content) share the open dialog's answer.
  const asking = new Map<string, Promise<boolean>>();
  let dialogChain: Promise<unknown> = Promise.resolve();
  const confirmOnce = (key: string, title: string, message: string): Promise<boolean> => {
    const open = asking.get(key);
    if (open) return open;
    const p = dialogChain.then(() => deps.confirm(title, message)).catch(() => false);
    dialogChain = p;
    asking.set(key, p);
    void p.finally(() => asking.delete(key));
    return p;
  };
  const approved = (pk: string): SignerDevice | undefined =>
    devices().find((d) => d.pubkey === pk && !d.revokedAt);
  const revoked = (pk: string) =>
    !approved(pk) && devices().some((d) => d.pubkey === pk && d.revokedAt);
  /** token bucket: `rate` per second, burst `burst`. */
  const take = (b: Bucket, rate: number, burst: number) => {
    const now = deps.now();
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * rate);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  };
  const log = (device: string, kind: number, ok: boolean, note?: string) =>
    deps.store.log({ at: deps.now(), device, kind, ok, note });

  return {
    /** Start a new one-time pairing code (replaces any earlier one). */
    newCode(): Code {
      code = {
        secret: deps.randomHex(16),
        expiresAt: deps.now() + BUNKER_CODE_TTL_MS,
      };
      return code;
    },
    cancelCode() {
      code = null;
    },
    activeCode(): Code | null {
      if (code && code.expiresAt <= deps.now()) code = null;
      return code;
    },
    /** Should the service keep its relay socket open? */
    wanted(): boolean {
      return (
        !!this.activeCode() ||
        devices().some((d) => d.via === "bunker" && !d.revokedAt)
      );
    },
    /**
     * Handle one decrypted request from NIP-46 client `client`. Returns the result string, throws BunkerError(message) for
     * an error reply, or returns null to stay silent (unknown clients, rate limited strangers).
     */
    async handle(
      client: string,
      method: string,
      params: unknown[],
    ): Promise<string | null> {
      if (!HEX64.test(client)) return null;
      const ok = approved(client);
      if (!ok) {
        if (method !== "connect") {
          if (revoked(client)) throw new BunkerError("revoked");
          return null; // strangers get nothing
        }
        if (!take(strangerBucket, 0.2, 10)) return null;
        const secret = typeof params[1] === "string" ? params[1] : "";
        const c = this.activeCode();
        if (!c || !secret || secret !== c.secret) {
          log(client, -1, false, "pairing refused: bad or expired code");
          throw new BunkerError("invalid or expired pairing code");
        }
        code = null; // one browser per code, whatever the answer
        const raw = typeof params[3] === "string" ? params[3] : "Web browser";
        const label =
          [...raw]
            .filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
            .join("")
            .slice(0, 80) || "Web browser";
        const allow = await deps.confirm(
          "Sign in a browser with this computer?",
          `"${label}" (device ${client.slice(0, 8)}…) used your sign-in code and wants this computer to be its signer.\n\nIt gets full access: it can sign anything and encrypt/decrypt for your account without asking. You can revoke it any time in Settings.`,
        );
        log(
          client,
          -1,
          allow,
          allow ? "paired (sign-in code)" : "pairing declined",
        );
        if (!allow) throw new BunkerError("declined on the desktop");
        const others = devices().filter((d) => d.pubkey !== client);
        deps.store.saveDevices([
          ...others,
          { pubkey: client, label, approvedAt: deps.now(), via: "bunker", meta: sanitizeDeviceMeta(params[4]) },
        ]);
        return "ack";
      }
      let b = buckets.get(client);
      if (!b) {
        b = { tokens: 60, at: deps.now() };
        buckets.set(client, b);
      }
      if (!take(b, 10, 60))
        throw new BunkerError("rate limited, try again in a moment");
      switch (method) {
        case "connect":
          return "ack";
        case "ping":
          return "pong";
        case "get_public_key":
          return String(await deps.userPubkey());
        case BUNKER_UNPAIR_METHOD:
          deps.store.saveDevices(
            devices().map((d) =>
              d.pubkey === client ? { ...d, revokedAt: deps.now() } : d,
            ),
          );
          log(client, -1, true, "forgotten by the browser");
          return "ok";
        case "sign_event": {
          const ev = parseEvent(params[0]);
          if (!bunkerAutoKind(ev.kind)) {
            const yes = await confirmOnce(
              `${client}:${ev.kind}:${ev.content}`,
              "Sign this for your browser?",
              `"${ok.label}" asks this computer to sign ${describeKind(ev.kind)}${ev.content ? `:\n\n${ev.content.slice(0, 300)}` : "."}`,
            );
            if (!yes) {
              log(client, ev.kind, false, "declined");
              throw new BunkerError("declined on the desktop");
            }
          }
          try {
            const signed = await deps.sign(ev);
            log(client, ev.kind, true);
            return JSON.stringify(signed);
          } catch (e) {
            log(client, ev.kind, false, "sign failed");
            throw new BunkerError(
              `sign failed: ${e instanceof Error ? e.message : String(e)}`.slice(
                0,
                200,
              ),
            );
          }
        }
        case "nip44_encrypt":
        case "nip44_decrypt": {
          const cr = deps.crypt;
          if (!cr) throw new BunkerError("encryption not supported");
          const peer =
            typeof params[0] === "string" ? params[0].toLowerCase() : "";
          const text = typeof params[1] === "string" ? params[1] : "";
          if (!HEX64.test(peer) || !text || text.length > MAX_CONTENT)
            throw new BunkerError("bad params");
          const self = peer === String(await cr.selfPubkey()).toLowerCase();
          const enc = method === "nip44_encrypt";
          try {
            if (enc)
              return self
                ? await cr.encryptToSelf(text)
                : await cr.encryptToPeer(peer, text);
            if (self) return await cr.decryptFromSelf(text);
            if (!cr.decryptFromPeer) throw new Error("not supported");
            return await cr.decryptFromPeer(peer, text);
          } catch {
            log(client, -2, false, `${enc ? "encrypt" : "decrypt"} failed`);
            throw new BunkerError(`${enc ? "encrypt" : "decrypt"} failed`);
          }
        }
        default:
          throw new BunkerError(`unsupported method ${method}`.slice(0, 80));
      }
    },
  };
}
export type BunkerPolicy = ReturnType<typeof createBunkerPolicy>;

function parseEvent(raw: unknown) {
  let e: Record<string, unknown>;
  try {
    e = typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    throw new BunkerError("bad event");
  }
  const kind = e.kind;
  if (
    typeof kind !== "number" ||
    !Number.isInteger(kind) ||
    kind < 0 ||
    kind > 65535
  )
    throw new BunkerError("bad kind");
  const created_at =
    typeof e.created_at === "number" && Number.isInteger(e.created_at)
      ? e.created_at
      : Math.floor(Date.now() / 1000);
  if (typeof e.content !== "string" || e.content.length > MAX_CONTENT)
    throw new BunkerError("bad content");
  if (
    !Array.isArray(e.tags) ||
    e.tags.length > MAX_TAGS ||
    !e.tags.every(
      (t) => Array.isArray(t) && t.every((x) => typeof x === "string"),
    )
  )
    throw new BunkerError("bad tags");
  return { kind, created_at, content: e.content, tags: e.tags as string[][] };
}

// ── transport key (bunker channel only; NOT the account key) ──
const TRANSPORT_KEY = "buzz-desktop-bunker-transport";
export function bunkerTransportSecret(
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): Uint8Array {
  const v = storage.getItem(TRANSPORT_KEY);
  if (v && HEX64.test(v)) return hexToBytes(v);
  const sk = crypto.getRandomValues(new Uint8Array(32));
  storage.setItem(TRANSPORT_KEY, bytesToHex(sk));
  return sk;
}

/** The relay side: one socket per relay, reconnect with backoff, decrypt → policy → encrypt reply. */
export function createBunkerService(opts: {
  policy: BunkerPolicy;
  secretKey: Uint8Array;
  relays?: string[];
  WebSocketImpl?: typeof WebSocket;
  onStatus?: (s: { connected: boolean }) => void;
}) {
  const relays = opts.relays ?? [BUNKER_RELAY];
  const WS = opts.WebSocketImpl ?? WebSocket;
  const sk = opts.secretKey;
  const pubkey = getPublicKey(sk);
  const seen = new Set<string>();
  /** request event id -> reply frame: the browser re-publishes the same event after a reconnect (the signer relay stores
   *  nothing), so a repeat gets the same answer again instead of silence. */
  const replies = new Map<string, { frame: string; at: number }>();
  const inflight = new Map<string, Promise<{ id: string; result?: string; error?: string } | null>>();
  const lastRx = new Map<string, number>();
  let keepalive: ReturnType<typeof setInterval> | undefined;
  const sockets = new Map<string, WebSocket>();
  const retry = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let running = false;

  const open = (url: string) => {
    if (!running) return;
    let ws: WebSocket;
    try {
      ws = new WS(url);
    } catch {
      return schedule(url);
    }
    sockets.set(url, ws);
    ws.onopen = () => {
      retry.set(url, 0);
      lastRx.set(url, Date.now());
      ws.send(
        JSON.stringify([
          "REQ",
          "bunker",
          {
            kinds: [KIND],
            "#p": [pubkey],
            since: Math.floor(Date.now() / 1000) - 60,
          },
        ]),
      );
      opts.onStatus?.({ connected: true });
    };
    ws.onmessage = (m) => {
      lastRx.set(url, Date.now());
      void onMsg(ws, String(m.data));
    };
    ws.onclose = () => {
      if (sockets.get(url) === ws) sockets.delete(url);
      opts.onStatus?.({
        connected: [...sockets.values()].some((s) => s.readyState === 1),
      });
      schedule(url);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  };
  const schedule = (url: string) => {
    if (!running || timers.has(url)) return;
    const n = (retry.get(url) ?? 0) + 1;
    retry.set(url, n);
    timers.set(
      url,
      setTimeout(
        () => {
          timers.delete(url);
          open(url);
        },
        Math.min(30_000, 1000 * 2 ** Math.min(n, 5)),
      ),
    );
  };

  const onMsg = async (ws: WebSocket, raw: string) => {
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
      kind: number;
      content: string;
      tags: string[][];
      created_at: number;
      sig: string;
    };
    if (!ev || ev.kind !== KIND) return;
    if (seen.has(ev.id)) {
      const r = replies.get(ev.id);
      if (r && ws.readyState === 1) ws.send(r.frame);
      return;
    }
    if (seen.size > 2000) seen.delete(seen.values().next().value as string);
    seen.add(ev.id);
    // Stale request (replayed by the relay buffer or a long-queued re-send): the browser has given up on it. Never prompt.
    if (Math.floor(Date.now() / 1000) - (ev.created_at || 0) > STALE_REQ_SECS) return;
    if (
      !ev.tags?.some((t) => t[0] === "p" && t[1] === pubkey) ||
      !verifyEvent(ev as never)
    )
      return;
    let body: { id?: unknown; method?: unknown; params?: unknown };
    try {
      body = JSON.parse(
        nip44.v2.decrypt(
          ev.content,
          nip44.v2.utils.getConversationKey(sk, ev.pubkey),
        ),
      );
    } catch {
      return; // NIP-04 clients aren't supported
    }
    if (
      typeof body.id !== "string" ||
      typeof body.method !== "string" ||
      body.id.length > 128
    )
      return;
    const params = Array.isArray(body.params) ? body.params : [];
    // The browser re-sends the SAME request id as a new event after a reconnect: one prompt / one answer per (client, id).
    const reqKey = `${ev.pubkey}:${body.id}`;
    let pending = inflight.get(reqKey);
    if (!pending) {
      const id = body.id;
      const method = body.method;
      pending = (async () => {
        try {
          const r = await opts.policy.handle(ev.pubkey, method, params);
          return r === null ? null : { id, result: r };
        } catch (e) {
          return { id, error: e instanceof BunkerError ? e.message : "internal error" };
        }
      })();
      inflight.set(reqKey, pending);
      void pending.finally(() => setTimeout(() => inflight.delete(reqKey), 120_000));
      if (inflight.size > 1000) inflight.delete(inflight.keys().next().value as string);
    }
    const res = await pending;
    if (res === null) return;
    const reply: { id: string; result?: string; error?: string } = res;
    const out = finalizeEvent(
      {
        kind: KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", ev.pubkey]],
        content: nip44.v2.encrypt(
          JSON.stringify(reply),
          nip44.v2.utils.getConversationKey(sk, ev.pubkey),
        ),
      },
      sk,
    );
    const frame = JSON.stringify(["EVENT", out]);
    replies.set(ev.id, { frame, at: Date.now() });
    if (replies.size > 500) {
      const cutoff = Date.now() - 120_000;
      for (const [k, v] of replies)
        if (v.at < cutoff || replies.size > 500) replies.delete(k);
    }
    // Reply on every open socket (the browser listens on the same relay set).
    for (const s of sockets.values()) if (s.readyState === 1) s.send(frame);
    if (ws.readyState === 1 && !sockets.has(ws.url)) ws.send(frame);
  };

  /** Reconnect one relay now (dead/half-open socket, network change, wake from sleep). */
  const reopen = (url: string) => {
    const old = sockets.get(url);
    sockets.delete(url);
    if (old) {
      old.onclose = null;
      try {
        old.close();
      } catch {}
    }
    const t = timers.get(url);
    if (t) clearTimeout(t);
    timers.delete(url);
    retry.set(url, 0);
    open(url);
  };
  // App-level keepalive: a no-match REQ every 20s must bring back EOSE. A socket silent for 45s is half-open (Mac
  // sleep/wake, Wi-Fi change, proxy idle) and gets replaced, so the desktop never sits deaf on a dead socket.
  const tick = () => {
    if (!running) return;
    const now = Date.now();
    for (const url of relays) {
      const ws = sockets.get(url);
      if (!ws) continue;
      if (ws.readyState === 1 && now - (lastRx.get(url) ?? now) > 45_000) {
        reopen(url);
        continue;
      }
      if (ws.readyState === 1)
        try {
          ws.send(
            JSON.stringify([
              "REQ",
              "ka",
              { kinds: [KIND], "#p": ["0".repeat(64)], limit: 0 },
            ]),
          );
        } catch {}
    }
  };
  const wake = () => {
    if (!running) return;
    for (const url of relays) {
      const ws = sockets.get(url);
      if (ws?.readyState !== 1) reopen(url);
      else tick();
    }
  };

  return {
    pubkey,
    uriFor: (secret: string) => buildBunkerUri(pubkey, secret, relays),
    start() {
      if (running) return;
      running = true;
      for (const r of relays) open(r);
      keepalive = setInterval(tick, 20_000);
      if (typeof window !== "undefined") {
        window.addEventListener("online", wake);
        window.addEventListener("focus", wake);
        document.addEventListener("visibilitychange", wake);
      }
    },
    stop() {
      running = false;
      clearInterval(keepalive);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", wake);
        window.removeEventListener("focus", wake);
        document.removeEventListener("visibilitychange", wake);
      }
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      for (const s of sockets.values())
        try {
          s.close();
        } catch {}
      sockets.clear();
      opts.onStatus?.({ connected: false });
    },
    get running() {
      return running;
    },
  };
}
