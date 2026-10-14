// Web/PWA: pinned sites never render in-app (no iframe panel); every open goes to the external/default browser.
// usePinnedSites keeps this id -> url map current so navigation code that only has a pin id can open it.
import { isTauri } from "@tauri-apps/api/core";

import { openExternalUrl } from "@/shared/lib/externalLinks";

const urls = new Map<string, string>();

export function rememberWebPinUrls(pins: ReadonlyArray<{ id: string; url: string }>): void {
  urls.clear();
  for (const p of pins) urls.set(p.id, p.url);
}

/** True on web (pins open externally there). */
export function pinsOpenExternally(): boolean {
  return !isTauri();
}

/** Opens the pin in the default browser (iOS standalone hands off to Safari). Returns false if the pin is unknown. */
export function openWebPinExternally(pinId: string, url?: string): boolean {
  const href = url || urls.get(pinId);
  if (!href) return false;
  openExternalUrl(href);
  return true;
}
