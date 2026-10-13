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
};
let current: DirectSigner | null = null;
const listeners = new Set<() => void>();
export const setDirectSigner = (s: DirectSigner | null) => {
  current = s;
  for (const l of listeners) l();
};
/** Back-compat: a bare sign route (always considered inactive for dormancy, no crypt). */
export const setDirectSignRoute = (r: DirectSignRoute | null) => setDirectSigner(r ? { sign: r, active: () => false } : null);
export const getDirectSignRoute = (): DirectSignRoute | null => current?.sign ?? null;
export const getDirectSigner = () => current;
/** Paired desktop reachable over a live Direct connection: the remote signer may sleep. */
export const desktopSignerActive = (): boolean => {
  try {
    return !!current?.active();
  } catch {
    return false;
  }
};
export const onDirectSignerChange = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
