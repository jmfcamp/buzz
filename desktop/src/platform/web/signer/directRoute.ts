// Optional fast path for signing on web: the paired desktop over Direct (see features/bridge/directSignerClient.ts).
// Set while a paired desktop has a live Direct connection; the instrumented signer tries it first and falls back to the
// remote signer (Primal) on any failure. Returned events are verified (id, sig, account pubkey) before use.
import type { SignedEvent, UnsignedEvent } from "./types";

export type DirectSignRoute = (ev: UnsignedEvent & { created_at: number }) => Promise<SignedEvent>;
let route: DirectSignRoute | null = null;
export const setDirectSignRoute = (r: DirectSignRoute | null) => {
  route = r;
};
export const getDirectSignRoute = () => route;
