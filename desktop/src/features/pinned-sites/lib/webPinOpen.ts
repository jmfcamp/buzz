// Web/PWA pinned sites. Per device (localStorage, never synced), each pin is either "Open with Buzz" (ON: the in-app
// iframe panel, kept alive by WebPinFrameHost) or, by default, opened in the external/default browser.
import { isTauri } from "@tauri-apps/api/core";
import * as React from "react";

import { openExternalUrl } from "@/shared/lib/externalLinks";

const urls = new Map<string, string>();
const PREF_KEY = "buzz-web-pin-open-in-buzz.v1";
const listeners = new Set<() => void>();
let inBuzz: Set<string> | null = null;

function load(): Set<string> {
  if (inBuzz) return inBuzz;
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) || "[]");
    inBuzz = new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    inBuzz = new Set();
  }
  return inBuzz;
}

export function rememberWebPinUrls(pins: ReadonlyArray<{ id: string; url: string }>): void {
  urls.clear();
  for (const p of pins) urls.set(p.id, p.url);
}

export function webPinUrl(pinId: string): string | undefined {
  return urls.get(pinId);
}

/** Per-device "Open with Buzz" for a pin (web only). Default off. */
export function isWebPinOpenInBuzz(pinId: string): boolean {
  return !isTauri() && load().has(pinId);
}

export function setWebPinOpenInBuzz(pinId: string, on: boolean): void {
  const s = load();
  if (on) s.add(pinId);
  else s.delete(pinId);
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify([...s]));
  } catch {
    /* private mode */
  }
  for (const f of listeners) f();
}

let version = 0;
listeners.add(() => {
  version += 1;
});
export function useWebPinOpenInBuzz(pinId: string): boolean {
  React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => version,
    () => 0,
  );
  return isWebPinOpenInBuzz(pinId);
}

/** True on web when this pin opens in the external browser (default). No pin id = "web at all". */
export function pinsOpenExternally(pinId?: string): boolean {
  if (isTauri()) return false;
  return pinId ? !isWebPinOpenInBuzz(pinId) : true;
}

/** Opens the pin in the default browser (iOS standalone hands off to Safari). Returns false if the pin is unknown. */
export function openWebPinExternally(pinId: string, url?: string): boolean {
  const href = url || urls.get(pinId);
  if (!href) return false;
  openExternalUrl(href);
  return true;
}
