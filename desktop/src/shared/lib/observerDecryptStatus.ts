import * as React from "react";

// Observer frames (kind 24200) each need a signer decrypt. While some are waiting or recently failed, the Activity pane says
// "Waiting for signer…" instead of "No ACP activity yet" (the frames exist; they just aren't readable yet).
// Tracked PER AGENT: one bot whose frames can't be decrypted (e.g. a community bot an older desktop won't decrypt) must not
// make every other agent's pane say "Waiting for signer".
const RECENT_FAILURE_MS = 30_000;
type S = { pending: number; lastFailureAt: number; lastSuccessAt: number };
const byAgent = new Map<string, S>();
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};
const norm = (a: string | null | undefined) => String(a ?? "").toLowerCase();
const st = (a: string | null | undefined): S => {
  const k = norm(a);
  let s = byAgent.get(k);
  if (!s) byAgent.set(k, (s = { pending: 0, lastFailureAt: 0, lastSuccessAt: 0 }));
  return s;
};
export function observerDecryptStarted(agent?: string | null): () => void {
  const s = st(agent);
  s.pending++;
  notify();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    s.pending = Math.max(0, s.pending - 1);
    notify();
  };
}
export function observerDecryptFailed(agent?: string | null): void {
  st(agent).lastFailureAt = Date.now();
  notify();
  setTimeout(notify, RECENT_FAILURE_MS + 50);
}
export function observerDecryptSucceeded(agent?: string | null): void {
  st(agent).lastSuccessAt = Date.now();
  notify();
}
export function observerWaitingForSigner(agent?: string | null): boolean {
  const s = byAgent.get(norm(agent));
  if (!s) return false;
  return s.pending > 0 || (s.lastFailureAt > s.lastSuccessAt && Date.now() - s.lastFailureAt < RECENT_FAILURE_MS);
}
export function useObserverWaitingForSigner(agent?: string | null): boolean {
  return React.useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => observerWaitingForSigner(agent),
    () => false,
  );
}
