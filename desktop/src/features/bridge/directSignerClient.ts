// Web side of "desktop as signer over Direct". The browser keeps a DEVICE keypair (not the account key) in localStorage;
// the desktop approves it once, then signs allow-listed kinds for it. Each request is signed by the device key and bound
// to the current Direct connection (per-connection nonce + increasing seq). Never connects on its own: it is only used
// while a Direct connection is already live, so it never costs an extra remote-signer round trip.
import { schnorr } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { SignedEvent, UnsignedEvent } from "@/platform/web/signer/types";
import type { DirectAgents } from "./directAgents";
import { AUTO_SIGN_KINDS, devicePubkeyOf, pairDigest, signDigest, signWithDevice } from "./directSignerProto";

const KEY = "buzz-direct-signer-device";
type Stored = { secret: string; pairedWith: string[] };

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

export const isPairedWith = (desktopId: string) => load().pairedWith.includes(desktopId);
export function forgetPairing(desktopId: string) {
  const s = load();
  save({ ...s, pairedWith: s.pairedWith.filter((d) => d !== desktopId) });
}

export class DirectSignerClient {
  private agents: DirectAgents;
  private desktopId: string;
  private hello: { nonce: string; approved: boolean } | null = null;
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
    this.hello = await this.agents.call<{ nonce: string; approved: boolean }>("signer.hello", { device: this.device });
    this.helloFor = gen;
    this.seq = 0;
    return this.hello;
  }

  /** Ask the desktop to approve this browser (shows a prompt on the desktop). Needs a live or new Direct connection. */
  async pair(label: string): Promise<boolean> {
    const h = await this.ensureHello(true);
    const sig = signWithDevice(pairDigest(h.nonce, this.device), load().secret);
    const r = await this.agents.call<{ approved: boolean }>("signer.pair", { device: this.device, label, sig });
    if (r.approved) {
      const s = load();
      if (!s.pairedWith.includes(this.desktopId)) save({ ...s, pairedWith: [...s.pairedWith, this.desktopId] });
    }
    return !!r.approved;
  }

  /** Sign over the live Direct connection; throws (caller falls back) when not live / not paired / declined. */
  async sign(ev: UnsignedEvent & { created_at: number }): Promise<SignedEvent> {
    if (!this.agents.live) throw new Error("direct not live");
    if (!isPairedWith(this.desktopId)) throw new Error("not paired");
    if (!AUTO_SIGN_KINDS.has(ev.kind)) throw new Error("kind needs desktop approval; use the remote signer");
    for (let attempt = 0; ; attempt++) {
      const h = await this.ensureHello(attempt > 0);
      if (!h.approved) throw new Error("not paired");
      const seq = ++this.seq;
      const req = { kind: ev.kind, created_at: ev.created_at, tags: ev.tags, content: ev.content };
      const sig = signWithDevice(signDigest(h.nonce, seq, req), load().secret);
      try {
        const r = await this.agents.call<{ event: SignedEvent }>("signer.sign", { device: this.device, seq, event: req, sig });
        return r.event;
      } catch (e) {
        if (attempt === 0 && /signer_session|bad seq/.test(String((e as { code?: string })?.code ?? e))) continue;
        if (/not_paired/.test(String((e as { code?: string })?.code ?? e))) forgetPairing(this.desktopId);
        throw e;
      }
    }
  }
}
