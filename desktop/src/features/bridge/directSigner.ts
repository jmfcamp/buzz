// Desktop side of "desktop as signer over Direct". Requests arrive as mgmt ops "signer.*" from the authenticated Direct
// listener (only this account's member key can open it), which tags each with the connection id (`_conn`).
//  - signer.hello {device}             -> {nonce, approved}: a fresh nonce bound to this Direct connection
//  - signer.pair  {device, label, sig}  -> desktop approval prompt; on yes the device is remembered
//  - signer.sign  {device, seq, event, sig}
//      sig = device schnorr over signDigest(nonce of THIS connection, seq, event); seq strictly increasing per connection.
//      AUTO_SIGN_KINDS are signed straight away; any other kind needs a desktop approval prompt.
// Every signature is logged per device; Settings can revoke a device. The account key is never returned or exported.
import { AUTO_SIGN_KINDS, pairDigest, signDigest, verifyDevice, type SignReqEvent } from "./directSignerProto";
import { MgmtError } from "./mgmtError";

export type SignerDevice = { pubkey: string; label: string; approvedAt: number; revokedAt?: number };
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
  now(): number;
};

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
          return { nonce, approved: !!approved(device) };
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
        case "signer.sign": {
          const c = connOf(p, device);
          if (!approved(device)) throw new MgmtError("not_paired", "This browser isn't approved on the desktop.");
          const seq = p.seq;
          if (typeof seq !== "number" || !Number.isInteger(seq) || seq <= c.seq) bad("bad seq");
          const ev = parseEvent(p.event);
          if (!verifyDevice(signDigest(c.nonce, seq as number, ev), sigOf(p), device)) throw new MgmtError("bad_signature", "Device signature didn't verify.");
          c.seq = seq as number;
          if (!AUTO_SIGN_KINDS.has(ev.kind)) {
            const ok = await deps.confirm(
              "Sign this for your browser?",
              `Your browser asks this computer to sign a kind ${ev.kind} event${ev.content ? `:\n\n${ev.content.slice(0, 300)}` : "."}`,
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
