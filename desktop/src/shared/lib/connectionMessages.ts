import * as React from "react";

// "Show connection messages" mode (per device, default OFF). Off: background connection work (relay reconnecting, pairing,
// signer reconnecting) only spins the nav Refresh icon; no banners. On (long-press / right-click Refresh): those cards show
// and stay up until hidden (their × / Hide, or another long press turns the mode off). Cards for a failed USER action always show.
const KEY = "buzz.connectionMessages";
const listeners = new Set<() => void>();
let on = (() => {
  try {
    return globalThis.localStorage?.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();
export function connectionMessagesOn(): boolean {
  return on;
}
export function setConnectionMessages(next: boolean): void {
  if (on === next) return;
  on = next;
  try {
    globalThis.localStorage?.setItem(KEY, next ? "1" : "0");
  } catch {
    /* private mode */
  }
  for (const l of listeners) l();
}
export function toggleConnectionMessages(): boolean {
  setConnectionMessages(!on);
  return on;
}
export function subscribeConnectionMessages(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export function useConnectionMessages(): boolean {
  return React.useSyncExternalStore(subscribeConnectionMessages, connectionMessagesOn, () => false);
}
