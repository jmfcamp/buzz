// Optional fast path for signing on web: the paired desktop over Direct (see features/bridge/directSignerClient.ts).
// Set while a desktop with Direct is selected; the instrumented signer tries it first and falls back to the remote signer
// (Primal) on any failure. Returned events are verified (id, sig, account pubkey) before use.
//  - active(): Direct is live and this browser is paired. While true, the remote signer stays dormant (no keepalive, no
//    health probes, no "signer isn't responding" banner); it is only woken by a request the desktop can't serve.
//  - crypt(): NIP-44 encrypt/decrypt via the desktop. Throws when the desktop doesn't support it (older builds) so the
//    caller falls back to the remote signer.
import type { SignedEvent, UnsignedEvent } from "./types";

export type DirectSignRoute = (ev: UnsignedEvent & { created_at: number }) => Promise<SignedEvent>;
export type DirectCryptOp = "nip44_encrypt" | "nip44_decrypt";
export type DirectSigner = {
  sign: DirectSignRoute;
  active: () => boolean;
  /** true when the desktop signs this kind without a prompt (short timeout); false = prompt there (long timeout). */
  isAuto?: (kind: number) => boolean;
  crypt?: (op: DirectCryptOp, peer: string, text: string) => Promise<string>;
  /** This browser is paired with the desktop (whether or not Direct is live right now). */
  isPaired?: () => boolean;
};
// Two desktop routes, Direct (tailnet) first, then the desktop bunker (NIP-46 over the Hula signer relay, desktopBunker.ts).
// Callers see ONE desktop signer: the first route that is live right now. When neither is live, signing goes straight to
// the remote signer (Clave) or, with no remote signer, fails fast (read-only).
let direct: DirectSigner | null = null;
let bunker: DirectSigner | null = null;
let current: DirectSigner | null = null;
const listeners = new Set<() => void>();
const live = (s: DirectSigner | null) => {
  try {
    return !!s?.active();
  } catch {
    return false;
  }
};
const pick = (): DirectSigner | null => (live(direct) ? direct : live(bunker) ? bunker : (direct ?? bunker));
const composite: DirectSigner = {
  sign: (ev) => {
    const s = pick();
    return s ? s.sign(ev) : Promise.reject(new Error("no desktop signer"));
  },
  active: () => live(direct) || live(bunker),
  isAuto: (k) => pick()?.isAuto?.(k) ?? true,
  crypt: (op, peer, text) => {
    const s = live(direct) && direct?.crypt ? direct : live(bunker) ? bunker : direct;
    return s?.crypt ? s.crypt(op, peer, text) : Promise.reject(new Error("desktop can't encrypt"));
  },
  isPaired: () => !!direct?.isPaired?.() || !!bunker?.isPaired?.(),
};
const recompute = () => {
  current = direct || bunker ? composite : null;
  for (const l of listeners) l();
};
/** Direct (tailnet) route. */
export const setDirectSigner = (s: DirectSigner | null) => {
  direct = s;
  recompute();
};
/** Desktop bunker route (signer relay). */
export const setBunkerSigner = (s: DirectSigner | null) => {
  bunker = s;
  recompute();
};
/** Live-ness changed inside a route (bunker came back / went away): wake listeners (remote signer park/unpark). */
export const notifyDirectSignerChange = () => {
  for (const l of listeners) l();
};
/** Back-compat: a bare sign route (always considered inactive for dormancy, no crypt). */
export const setDirectSignRoute = (r: DirectSignRoute | null) => setDirectSigner(r ? { sign: r, active: () => false } : null);
export const getDirectSignRoute = (): DirectSignRoute | null => current?.sign ?? null;
/** The Direct route itself (not the composite): for code that manages the Direct connection. */
export const getDirectRoute = () => direct;
export const getDirectSigner = () => current;
/** Paired desktop reachable over a live Direct connection: the remote signer may sleep. */
let lastActiveAt = 0;
/** A paired desktop that was live this recently still counts (Direct reconnects, iOS resume, the Buzz Term socket swap). */
const RECENT_ACTIVE_MS = 60_000;
export const desktopSignerActive = (): boolean => {
  try {
    if (current?.active()) {
      lastActiveAt = Date.now();
      return true;
    }
  } catch {
    /* fall through */
  }
  return false;
};
/** For health/banner decisions only (never routing): live now, or live within the last minute and still registered. */
export const desktopSignerCovering = (): boolean => desktopSignerActive() || (!!current && Date.now() - lastActiveAt < RECENT_ACTIVE_MS);
export const onDirectSignerChange = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
