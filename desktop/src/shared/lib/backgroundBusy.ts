import * as React from "react";

// One shared "the app is doing connection work in the background" signal (signer connect/reconnect, relay reconnect, pairing
// checks, catch-up, observer decrypts). The nav-bar Refresh icon spins while it's on, instead of banners popping up for
// transient work. Shown only after SHOW_DELAY_MS (quick work never flickers) and kept for at least MIN_SPIN_MS.
const SHOW_DELAY_MS = 400;
const MIN_SPIN_MS = 900;

const active = new Map<string, number>(); // key -> count
const listeners = new Set<() => void>();
let shown = false;
let shownAt = 0;
let showTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const notify = () => {
  for (const l of listeners) l();
};
const setShown = (v: boolean) => {
  if (shown === v) return;
  shown = v;
  if (v) shownAt = Date.now();
  notify();
};
const update = () => {
  if (active.size > 0) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (!shown && !showTimer) {
      showTimer = setTimeout(() => {
        showTimer = null;
        if (active.size > 0) setShown(true);
      }, SHOW_DELAY_MS);
    }
    return;
  }
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  if (shown && !hideTimer) {
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (active.size === 0) setShown(false);
    }, Math.max(0, MIN_SPIN_MS - (Date.now() - shownAt)));
  }
};

/** Mark `key` busy (counted). Returns a function that ends this piece of work (idempotent). */
export function beginBusy(key: string): () => void {
  active.set(key, (active.get(key) ?? 0) + 1);
  update();
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const n = (active.get(key) ?? 1) - 1;
    if (n <= 0) active.delete(key);
    else active.set(key, n);
    update();
  };
}
/** Level-style: `key` is busy while `on` is true (for state machines that report a state rather than start/stop). */
export function setBusy(key: string, on: boolean): void {
  if (on) {
    if (!active.has(key)) active.set(key, 1);
  } else active.delete(key);
  update();
}
export function isBackgroundBusy(): boolean {
  return shown;
}
export function subscribeBackgroundBusy(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export function useBackgroundBusy(): boolean {
  return React.useSyncExternalStore(subscribeBackgroundBusy, isBackgroundBusy, () => false);
}
