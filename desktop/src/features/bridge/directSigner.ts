// Desktop side of "desktop as signer over Direct". Requests arrive as mgmt ops "signer.*" from the authenticated Direct
// listener (only this account's member key can open it), which tags each with the connection id (`_conn`).
//  - signer.hello {device}             -> {nonce, approved}: a fresh nonce bound to this Direct connection
//  - signer.pair  {device, label, sig}  -> desktop approval prompt; on yes the device is remembered
//  - signer.sign  {device, seq, event, sig}
//      sig = device schnorr over signDigest(nonce of THIS connection, seq, event); seq strictly increasing per connection.
//      AUTO_SIGN_KINDS are signed straight away; any other kind needs a desktop approval prompt.
//  - signer.authConnect {device, sig, nonce, desktop}  (sent by the listener itself, before the connection is open)
//      sig = device schnorr over connectDigest(challenge nonce, desktop id, connection id, device); approved devices only.
//  - signer.unpair {device, sig}       -> the browser forgot this desktop: revoke it here too (logged)
//  - a revoked device gets an explicit "revoked" error (not "not_paired") so the browser clears its pairing at once
//  - signer.crypt {device, seq, op, peer, text, sig}   (advertised as caps ["nip44"] in hello)
//      NIP-44 encrypt/decrypt for the user's own synced app data. Self (peer = own pubkey) runs without asking; encrypting
//      to anyone else needs a desktop prompt; decrypting from one of the user's OWN agents/bots (observer activity frames) runs
//      without asking; decrypting from anyone else is not offered (the browser uses its remote signer).
// Every signature is logged per device; Settings can revoke a device. The account key is never returned or exported.
import {
  AUTO_SIGN_KINDS_V2,
  SIGNER_CAP_SIGN_ANY,
  connectDigest,
  cryptDigest,
  type CryptOp,
  pairDigest,
  unpairDigest,
  SIGNER_CAP_NIP44,
  signDigest,
  verifyDevice,
  type SignReqEvent,
} from "./directSignerProto";
import { MgmtError } from "./mgmtError";

/** via: how the browser reaches this desktop ("direct" = Direct/tailnet pairing, "bunker" = NIP-46 over the signer relay). */
export type SignerDevice = { pubkey: string; label: string; approvedAt: number; revokedAt?: number; via?: "direct" | "bunker" };
/** kind: event kind for signatures, -1 for pairing/revoke, -2 for encrypt/decrypt (note says which). */
export type SignerLogEntry = { at: number; device: string; kind: number; ok: boolean; note?: string };

export type SignerStore = {
  devices(): SignerDevice[];
  saveDevices(d: SignerDevice[]): void;
  log(e: SignerLogEntry): void;
};

export type SignerDeps = {
  store: SignerStore;
  /** Ask the person at the desktop; true = allow. */
  confirm(title: string, message: string): Promise<boolean>;
  /** Sign with the desktop's account key (never exported). */
  sign(ev: SignReqEvent): Promise<unknown>;
  randomHex(bytes: number): string;
  /** NIP-44 with the account key. Optional: without it the desktop doesn't advertise encrypt/decrypt. */
  crypt?: {
    selfPubkey(): Promise<string> | string;
    encryptToSelf(text: string): Promise<string>;
    encryptToPeer(peer: string, text: string): Promise<string>;
    decryptFromSelf(text: string): Promise<string>;
    /** Observer frames (kind 24200) from the user's OWN agents/bots: decrypt without a prompt. Optional (newer desktops). */
    decryptFromPeer?(peer: string, text: string): Promise<string>;
    isOwnAgent?(peer: string): Promise<boolean>;
  };
  now(): number;
};

const KIND_NAMES: Record<number, string> = {
  0: "a profile update (kind 0)",
  3: "a follow list update (kind 3)",
  5: "a deletion (kind 5)",
  10002: "a relay list update (kind 10002)",
  9000: "a member/channel admin change (kind 9000)",
  9001: "a member removal (kind 9001)",
  9002: "a channel edit (kind 9002)",
  9007: "a channel creation (kind 9007)",
  9008: "a channel deletion (kind 9008)",
};
const describeKind = (k: number) => KIND_NAMES[k] ?? `a kind ${k} event`;
const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;
const MAX_CONTENT = 256_000;
const MAX_TAGS = 2_000;

type Conn = { nonce: string; device: string; seq: number; at: number };

const bad = (m: string): never => {
  throw new MgmtError("bad_request", m);
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function parseEvent(v: unknown): SignReqEvent {
  const e = obj(v);
  const kind = e.kind;
  const created_at = e.created_at;
  if (typeof kind !== "number" || !Number.isInteger(kind) || kind < 0 || kind > 65535) bad("bad kind");
  if (typeof created_at !== "number" || !Number.isInteger(created_at)) bad("bad created_at");
  if (typeof e.content !== "string" || e.content.length > MAX_CONTENT) bad("bad content");
  if (!Array.isArray(e.tags) || e.tags.length > MAX_TAGS || !e.tags.every((t) => Array.isArray(t) && t.every((x) => typeof x === "string")))
    bad("bad tags");
  return { kind: kind as number, created_at: created_at as number, tags: e.tags as string[][], content: e.content as string };
}

export function createDirectSigner(deps: SignerDeps) {
  const conns = new Map<string, Conn>(); // Direct connection id -> session
  const approved = (pk: string) => deps.store.devices().find((d) => d.pubkey === pk && !d.revokedAt);
  const revoked = (pk: string) => deps.store.devices().some((d) => d.pubkey === pk && d.revokedAt) && !approved(pk);
  const notApproved = (device: string): never => {
    if (revoked(device)) throw new MgmtError("revoked", "This browser was revoked on the desktop.");
    throw new MgmtError("not_paired", "This browser isn't approved on the desktop.");
  };
  const connOf = (p: Record<string, unknown>, device: string): Conn => {
    const c = conns.get(String(p._conn ?? ""));
    if (!c || c.device !== device) throw new MgmtError("signer_session", "Say hello on this connection first.");
    return c;
  };
  const deviceOf = (p: Record<string, unknown>) => {
    const d = typeof p.device === "string" ? p.device.toLowerCase() : "";
    return HEX64.test(d) ? d : bad("bad device");
  };
  const sigOf = (p: Record<string, unknown>) => (typeof p.sig === "string" && HEX128.test(p.sig) ? p.sig : bad("bad signature"));

  return {
    async handle(op: string, params: unknown): Promise<unknown> {
      const p = obj(params);
      const connId = typeof p._conn === "string" ? p._conn : "";
      if (!connId) throw new MgmtError("signer_session", "Not a Direct connection.");
      const device = deviceOf(p);
      switch (op) {
        case "signer.hello": {
          if (conns.size > 64) conns.delete(conns.keys().next().value as string);
          const nonce = deps.randomHex(16);
          conns.set(connId, { nonce, device, seq: 0, at: deps.now() });
          return { nonce, approved: !!approved(device), revoked: revoked(device), caps: deps.crypt ? [SIGNER_CAP_SIGN_ANY, SIGNER_CAP_NIP44] : [SIGNER_CAP_SIGN_ANY] };
        }
        case "signer.authConnect": {
          const nonce = typeof p.nonce === "string" && /^[0-9a-f]{16,128}$/.test(p.nonce) ? p.nonce : bad("bad nonce");
          const desktop = typeof p.desktop === "string" && p.desktop.length <= 128 ? p.desktop : bad("bad desktop");
          if (!verifyDevice(connectDigest(nonce, desktop, connId, device), sigOf(p), device))
            throw new MgmtError("bad_signature", "Device signature didn't verify.");
          if (!approved(device)) notApproved(device);
          return { approved: true };
        }
        case "signer.pair": {
          const c = connOf(p, device);
          if (!verifyDevice(pairDigest(c.nonce, device), sigOf(p), device)) throw new MgmtError("bad_signature", "Device signature didn't verify.");
          if (approved(device)) return { approved: true };
          const label = (typeof p.label === "string" ? p.label : "Web browser").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80) || "Web browser";
          const ok = await deps.confirm(
            "Let this browser sign with this computer?",
            `"${label}" (device ${device.slice(0, 8)}…) wants to use this computer as its signer over Direct.\n\nIt can then sign messages, reactions, read markers and synced settings for your account without asking. Anything else will ask you here first. You can revoke it any time in Settings.`,
          );
          deps.store.log({ at: deps.now(), device, kind: -1, ok, note: ok ? "paired" : "pairing declined" });
          if (!ok) throw new MgmtError("declined", "Declined on the desktop.");
          const others = deps.store.devices().filter((d) => d.pubkey !== device);
          deps.store.saveDevices([...others, { pubkey: device, label, approvedAt: deps.now() }]);
          return { approved: true };
        }
        case "signer.unpair": {
          const c = connOf(p, device);
          if (!verifyDevice(unpairDigest(c.nonce, device), sigOf(p), device)) throw new MgmtError("bad_signature", "Device signature didn't verify.");
          if (approved(device)) {
            deps.store.saveDevices(deps.store.devices().map((d) => (d.pubkey === device ? { ...d, revokedAt: deps.now() } : d)));
            deps.store.log({ at: deps.now(), device, kind: -1, ok: true, note: "forgotten by the browser" });
          }
          return { unpaired: true };
        }
        case "signer.sign": {
          const c = connOf(p, device);
          if (!approved(device)) notApproved(device);
          const seq = p.seq;
          if (typeof seq !== "number" || !Number.isInteger(seq) || seq <= c.seq) bad("bad seq");
          const ev = parseEvent(p.event);
          if (!verifyDevice(signDigest(c.nonce, seq as number, ev), sigOf(p), device)) throw new MgmtError("bad_signature", "Device signature didn't verify.");
          c.seq = seq as number;
          if (!AUTO_SIGN_KINDS_V2.has(ev.kind)) {
            const ok = await deps.confirm(
              "Sign this for your browser?",
              `Your browser asks this computer to sign ${describeKind(ev.kind)}${ev.content ? `:\n\n${ev.content.slice(0, 300)}` : "."}`,
            );
            if (!ok) {
              deps.store.log({ at: deps.now(), device, kind: ev.kind, ok: false, note: "declined" });
              throw new MgmtError("declined", "Declined on the desktop.");
            }
          }
          try {
            const signed = await deps.sign(ev);
            deps.store.log({ at: deps.now(), device, kind: ev.kind, ok: true });
            return { event: signed };
          } catch (e) {
            deps.store.log({ at: deps.now(), device, kind: ev.kind, ok: false, note: "sign failed" });
            throw e;
          }
        }
        case "signer.crypt": {
          const cr = deps.crypt;
          if (!cr) throw new MgmtError("unknown_op", "That operation isn't supported.");
          const c = connOf(p, device);
          if (!approved(device)) notApproved(device);
          const seq = p.seq;
          if (typeof seq !== "number" || !Number.isInteger(seq) || seq <= c.seq) bad("bad seq");
          const op = p.op === "nip44_encrypt" || p.op === "nip44_decrypt" ? (p.op as CryptOp) : bad("bad op");
          const peer = typeof p.peer === "string" && HEX64.test(p.peer.toLowerCase()) ? p.peer.toLowerCase() : bad("bad peer");
          const text = typeof p.text === "string" && p.text.length <= MAX_CONTENT ? p.text : bad("bad text");
          if (!verifyDevice(cryptDigest(c.nonce, seq as number, op, peer, text), sigOf(p), device))
            throw new MgmtError("bad_signature", "Device signature didn't verify.");
          c.seq = seq as number;
          const self = peer === String(await cr.selfPubkey()).toLowerCase();
          const what = op === "nip44_encrypt" ? "encrypt" : "decrypt";
          const log = (ok: boolean, extra = "") =>
            deps.store.log({ at: deps.now(), device, kind: -2, ok, note: `${what}${self ? " (self)" : ` ${op === "nip44_decrypt" ? "from" : "to"} ${peer.slice(0, 8)}…`}${extra}` });
          const ownAgent =
            !self && op === "nip44_decrypt" && !!cr.decryptFromPeer && !!cr.isOwnAgent && (await cr.isOwnAgent(peer).catch(() => false));
          if (!self && !ownAgent) {
            if (op === "nip44_decrypt") {
              log(false, ": not offered");
              throw new MgmtError("unsupported", "Only your own data can be decrypted here.");
            }
            const ok = await deps.confirm(
              "Encrypt this for your browser?",
              `Your browser asks this computer to encrypt something to another key (${peer.slice(0, 8)}…). Only allow this if you just did something that needs it.`,
            );
            if (!ok) {
              log(false, ": declined");
              throw new MgmtError("declined", "Declined on the desktop.");
            }
          }
          try {
            const out =
              op === "nip44_decrypt"
                ? ownAgent && cr.decryptFromPeer
                  ? await cr.decryptFromPeer(peer, text)
                  : await cr.decryptFromSelf(text)
                : self
                  ? await cr.encryptToSelf(text)
                  : await cr.encryptToPeer(peer, text);
            if (!ownAgent) log(true); // observer frames are many per second: only failures are logged for them
            return { text: out };
          } catch (e) {
            log(false, ": failed");
            throw e;
          }
        }
        default:
          throw new MgmtError("unknown_op", "That operation isn't supported.");
      }
    },
  };
}

// ── persistent store (desktop localStorage; holds device PUBLIC keys and a log, no secrets) ──
const DEVICES_KEY = "buzz-direct-signer-devices";
const LOG_KEY = "buzz-direct-signer-log";
const LOG_MAX = 300;
const listeners = new Set<() => void>();
const read = <T>(k: string, d: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(k) || "null") as T) ?? d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* full */
  }
  for (const l of listeners) l();
};
export const localSignerStore: SignerStore = {
  devices: () => read<SignerDevice[]>(DEVICES_KEY, []),
  saveDevices: (d) => write(DEVICES_KEY, d),
  log: (e) => write(LOG_KEY, [e, ...read<SignerLogEntry[]>(LOG_KEY, [])].slice(0, LOG_MAX)),
};
export const signerLog = () => read<SignerLogEntry[]>(LOG_KEY, []);
export function revokeSignerDevice(pubkey: string, now = Date.now()) {
  localSignerStore.saveDevices(localSignerStore.devices().map((d) => (d.pubkey === pubkey ? { ...d, revokedAt: now } : d)));
  localSignerStore.log({ at: now, device: pubkey, kind: -1, ok: true, note: "revoked" });
}
export function subscribeSignerStore(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
