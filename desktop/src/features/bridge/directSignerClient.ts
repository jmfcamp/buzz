import { beginBusy } from "@/shared/lib/backgroundBusy";
// Web side of "desktop as signer over Direct". The browser keeps a DEVICE keypair (not the account key) in localStorage;
// the desktop approves it once, then signs allow-listed kinds for it. Each request is signed by the device key and bound
// to the current Direct connection (per-connection nonce + increasing seq). Never connects on its own: it is only used
// while a Direct connection is already live, so it never costs an extra remote-signer round trip.
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { SignedEvent, UnsignedEvent } from "@/platform/web/signer/types";
import type { DirectAgents } from "./directAgents";
import {
  isAutoSignKind,
  SIGNER_CAP_SIGN_ANY,
  connectDigest,
  cryptDigest,
  type CryptOp,
  devicePubkeyOf,
  pairDigest,
  unpairDigest,
  SIGNER_CAP_NIP44,
  signDigest,
  signWithDevice,
} from "./directSignerProto";

const KEY = "buzz-direct-signer-device";
/** pendingUnpair: desktops this browser forgot while Direct was down; told on the next connect. */
type Stored = { secret: string; pairedWith: string[]; pendingUnpair?: string[] };
export const PAIRING_EVENT = "buzz-direct-signer-pairing";
const notifyPairing = () => {
  try {
    window.dispatchEvent(new Event(PAIRING_EVENT));
  } catch {
    /* no window (tests) */
  }
};

function load(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null") as Stored | null;
    if (s && /^[0-9a-f]{64}$/.test(s.secret) && Array.isArray(s.pairedWith)) return s;
  } catch {
    /* fall through */
  }
  const s: Stored = { secret: bytesToHex(schnorr.utils.randomSecretKey()), pairedWith: [] };
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
  return s;
}
const save = (s: Stored) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
};

/** Device-key answer to a Direct connect challenge (desktops that advertise deviceAuth); null when not paired with it. */
export function deviceConnectAuth(desktopId: string, nonce: string, connId: string): { device: string; sig: string } | null {
  const s = load();
  if (!s.pairedWith.includes(desktopId)) return null;
  const device = devicePubkeyOf(s.secret);
  return { device, sig: signWithDevice(connectDigest(nonce, desktopId, connId, device), s.secret) };
}
export const isPairedWith = (desktopId: string) => load().pairedWith.includes(desktopId);
/** Local only (e.g. the desktop said "revoked"): no message back. */
export function forgetPairing(desktopId: string) {
  const s = load();
  if (!s.pairedWith.includes(desktopId)) return;
  save({ ...s, pairedWith: s.pairedWith.filter((d) => d !== desktopId) });
  notifyPairing();
}
/** The user clicked Forget: unpair here and tell the desktop (now if possible, else on the next connect). */
export function forgetAndRevoke(desktopId: string, client?: DirectSignerClient | null) {
  const s = load();
  save({
    ...s,
    pairedWith: s.pairedWith.filter((d) => d !== desktopId),
    pendingUnpair: [...new Set([...(s.pendingUnpair ?? []), desktopId])],
  });
  notifyPairing();
  void client?.flushUnpair().catch(() => {});
}
/** The desktop revoked us: unpair now and say so (no silent switch to the other signer). */
function revokedByDesktop(desktopId: string) {
  if (!isPairedWith(desktopId)) return;
  forgetPairing(desktopId);
  void import("@/shared/ui/statusPills")
    .then((m) => m.noteStatus("direct-signer-revoked", "Your desktop revoked this browser", "Signing uses your usual signer. Pair again in Settings → Desktop signing."))
    .catch(() => {});
}
const isRevoked = (e: unknown) => /revoked/.test(String((e as { code?: string })?.code ?? e));

export class DirectSignerClient {
  private agents: DirectAgents;
  private desktopId: string;
  private hello: { nonce: string; approved: boolean; caps?: string[] } | null = null;
  private helloFor: unknown = null;
  private seq = 0;
  constructor(agents: DirectAgents, desktopId: string) {
    this.agents = agents;
    this.desktopId = desktopId;
  }
  get device() {
    return devicePubkeyOf(load().secret);
  }

  private async ensureHello(force = false) {
    const gen = this.agents.expiresAt; // changes with each new signed connection
    if (!force && this.hello && this.helloFor === gen) return this.hello;
    this.hello = await this.agents.call<{ nonce: string; approved: boolean; revoked?: boolean; caps?: string[] }>("signer.hello", {
      device: this.device,
    });
    this.helloFor = gen;
    this.seq = 0;
    // Re-check on every (re)connect: a desktop that no longer approves us means we're not paired, shown right away.
    if (!this.hello.approved && isPairedWith(this.desktopId)) revokedByDesktop(this.desktopId);
    return this.hello;
  }

  /** Re-check pairing with the desktop (on load / reconnect) and deliver a queued Forget. Never throws. */
  async refresh(): Promise<void> {
    const busyDone = beginBusy("pairing-check");
    try {
      return await this.refreshInner();
    } finally {
      busyDone();
    }
  }
  private async refreshInner(): Promise<void> {
    if (!this.agents.live) return;
    try {
      await this.ensureHello(true);
      await this.flushUnpair();
    } catch {
      /* desktop unreachable or older: try again next time */
    }
  }

  /** Send a queued Forget for this desktop. Older desktops don't know signer.unpair: the entry is dropped then. */
  async flushUnpair(): Promise<void> {
    const s = load();
    if (!s.pendingUnpair?.includes(this.desktopId) || !this.agents.live) return;
    const h = await this.ensureHello();
    try {
      await this.agents.call("signer.unpair", { device: this.device, sig: signWithDevice(unpairDigest(h.nonce, this.device), load().secret) });
    } catch (e) {
      if (!/unknown_op/.test(String((e as { code?: string })?.code ?? e))) throw e;
    }
    const now = load();
    save({ ...now, pendingUnpair: (now.pendingUnpair ?? []).filter((d) => d !== this.desktopId) });
  }

  /** Ask the desktop to approve this browser (shows a prompt on the desktop). Needs a live or new Direct connection.
   *  Failures throw a PairingError naming the step that failed (connect / hello / pair request). */
  async pair(label: string): Promise<boolean> {
    let step: PairingStep = "connect";
    try {
      await this.agents.connect();
      step = "hello";
      const h = await this.ensureHello(true);
      step = "pair";
      const sig = signWithDevice(pairDigest(h.nonce, this.device), load().secret);
      const r = await this.agents.call<{ approved: boolean }>("signer.pair", { device: this.device, label, sig });
      if (r.approved) {
        const s = load();
        save({
          ...s,
          pairedWith: s.pairedWith.includes(this.desktopId) ? s.pairedWith : [...s.pairedWith, this.desktopId],
          pendingUnpair: (s.pendingUnpair ?? []).filter((d) => d !== this.desktopId),
        });
        notifyPairing();
      }
      return !!r.approved;
    } catch (e) {
      throw PairingError.from(step, e);
    }
  }

  /** Will this kind be signed without a prompt on the desktop? (unknown before the first hello: assume the old list) */
  isAuto(kind: number): boolean {
    return isAutoSignKind(kind, this.hello?.caps);
  }

  /** Paired with this desktop (Direct may or may not be live). */
  isPaired(): boolean {
    return isPairedWith(this.desktopId);
  }

  /** Paired + Direct live: the remote signer can stay dormant. */
  active(): boolean {
    return this.agents.live && isPairedWith(this.desktopId) && this.hello?.approved !== false;
  }

  /** NIP-44 encrypt/decrypt over Direct. Throws "unsupported" on desktops that don't advertise it (caller falls back). */
  async crypt(op: CryptOp, peer: string, text: string): Promise<string> {
    if (!this.agents.live) throw new Error("direct not live");
    if (!isPairedWith(this.desktopId)) throw new Error("not paired");
    for (let attempt = 0; ; attempt++) {
      const h = await this.ensureHello(attempt > 0);
      if (!h.approved) throw new Error("not paired");
      if (!h.caps?.includes(SIGNER_CAP_NIP44)) throw new Error("unsupported: desktop can't encrypt/decrypt yet");
      const seq = ++this.seq;
      const sig = signWithDevice(cryptDigest(h.nonce, seq, op, peer, text), load().secret);
      try {
        const r = await this.agents.call<{ text: string }>("signer.crypt", { device: this.device, seq, op, peer, text, sig });
        if (typeof r?.text !== "string") throw new Error("bad crypt reply");
        return r.text;
      } catch (e) {
        if (attempt === 0 && /signer_session|bad seq/.test(String((e as { code?: string })?.code ?? e))) continue;
        if (isRevoked(e) || /not_paired/.test(String((e as { code?: string })?.code ?? e))) revokedByDesktop(this.desktopId);
        throw e;
      }
    }
  }

  /** Sign over the live Direct connection; throws (caller falls back) when not live / not paired / declined. */
  async sign(ev: UnsignedEvent & { created_at: number }): Promise<SignedEvent> {
    if (!this.agents.live) throw new Error("direct not live");
    if (!isPairedWith(this.desktopId)) throw new Error("not paired");
    for (let attempt = 0; ; attempt++) {
      const h = await this.ensureHello(attempt > 0);
      if (!h.approved) throw new Error("not paired");
      // Older desktops sign only the no-prompt list; newer ones (sign-any) sign everything, prompting there for the rest.
      if (!isAutoSignKind(ev.kind, h.caps) && !h.caps?.includes(SIGNER_CAP_SIGN_ANY))
        throw new Error("kind needs desktop approval; use the remote signer");
      const seq = ++this.seq;
      const req = { kind: ev.kind, created_at: ev.created_at, tags: ev.tags, content: ev.content };
      const sig = signWithDevice(signDigest(h.nonce, seq, req), load().secret);
      try {
        const r = await this.agents.call<{ event: SignedEvent }>("signer.sign", { device: this.device, seq, event: req, sig });
        return r.event;
      } catch (e) {
        if (attempt === 0 && /signer_session|bad seq/.test(String((e as { code?: string })?.code ?? e))) continue;
        if (isRevoked(e) || /not_paired/.test(String((e as { code?: string })?.code ?? e))) revokedByDesktop(this.desktopId);
        throw e;
      }
    }
  }
}

export type PairingStep = "connect" | "hello" | "pair";
/** A failed pairing, with the step and the low-level code so the card can say exactly what went wrong. */
export class PairingError extends Error {
  step: PairingStep;
  /** connect sub-step from RemoteConnection: url / socket / challenge / signing / auth */
  stage?: string;
  code: string;
  detail?: string;
  constructor(step: PairingStep, code: string, detail?: string, stage?: string) {
    super(`${step}${stage ? `/${stage}` : ""}: ${code}${detail ? ` (${detail})` : ""}`);
    this.step = step;
    this.code = code;
    this.detail = detail;
    this.stage = stage;
  }
  static from(step: PairingStep, e: unknown): PairingError {
    if (e instanceof PairingError) return e;
    const x = e as { code?: unknown; detail?: unknown; stage?: unknown; message?: unknown };
    const code = typeof x?.code === "string" ? x.code : "error";
    const detail = typeof x?.detail === "string" ? x.detail : typeof x?.message === "string" && x.message !== code ? x.message : e instanceof Error ? undefined : String(e);
    return new PairingError(step, code, detail, typeof x?.stage === "string" ? x.stage : undefined);
  }
}

/** Plain-language explanation of a failed pairing step. */
export function describePairingError(e: PairingError): string {
  const c = e.code;
  if (e.step === "connect") {
    if (c === "bad_url") return "This browser has no valid Direct address for your desktop (it needs a wss:// tailnet address). Turn Direct off and on again on the desktop.";
    if (c === "wrong_desktop") return "A different Hula Buzz app on the Mac is serving Direct (port 9443). Turn Direct on in the app you want to pair with.";
    if (e.stage === "socket" || c === "unreachable")
      return "Couldn't open a connection to your desktop over the tailnet. Check that Tailscale is connected on this device (VPN on), that the desktop is awake with Direct on, and that this device can open the desktop's .ts.net address.";
    if (e.stage === "challenge") return "Connected to your desktop, but it didn't send a sign-in challenge. Restart Direct on the desktop.";
    if (e.stage === "signing")
      return c === "declined" ? "Your signer declined the sign-in to your desktop." : c === "timeout" ? "Your signer didn't answer the sign-in to your desktop in time. Open your signer app, then try again." : "Your signer couldn't sign the sign-in to your desktop.";
    if (e.stage === "auth")
      return c === "timeout" ? "Your desktop didn't confirm the sign-in." : `Your desktop refused the sign-in (${c}). Make sure this browser is signed in with the same account as the desktop.`;
    return `Connecting to your desktop failed (${c}).`;
  }
  if (e.step === "hello") return `Connected to your desktop, but it didn't answer the signer hello (${c}). Your desktop may need an update.`;
  if (c === "declined") return "Declined on the desktop.";
  if (c === "timeout") return "The pair request reached your desktop, but nobody answered the Allow prompt in time. Look for the prompt on the Mac and try again.";
  if (c === "closed") return "The connection to your desktop dropped while waiting for approval. Try again.";
  return `Your desktop rejected the pair request (${c}).`;
}
