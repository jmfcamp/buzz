import * as React from "react";

// Observer frames (kind 24200) each need a signer decrypt. While some are waiting or recently failed, the Activity pane says
// "Waiting for signer…" instead of "No ACP activity yet" (the frames exist; they just aren't readable yet).
const RECENT_FAILURE_MS = 30_000;
let pending = 0;
let lastFailureAt = 0;
let lastSuccessAt = 0;
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};
export function observerDecryptStarted(): () => void {
  pending++;
  notify();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    pending = Math.max(0, pending - 1);
    notify();
  };
}
export function observerDecryptFailed(): void {
  lastFailureAt = Date.now();
  notify();
  setTimeout(notify, RECENT_FAILURE_MS + 50);
}
export function observerDecryptSucceeded(): void {
  lastSuccessAt = Date.now();
}
export function observerWaitingForSigner(): boolean {
  return pending > 0 || (lastFailureAt > lastSuccessAt && Date.now() - lastFailureAt < RECENT_FAILURE_MS);
}
export function useObserverWaitingForSigner(): boolean {
  return React.useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    observerWaitingForSigner,
    () => false,
  );
}
