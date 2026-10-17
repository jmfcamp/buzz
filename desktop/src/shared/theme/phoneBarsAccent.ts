// "Use accent color for phone bars" (Settings > Appearance, right under Accent color; web only). Saved on this device.
//
// On (the default): the phone top bar (Search / Back / Forward / Home / Refresh, tab-count pill) and the floating
// bottom tab bar use the chosen accent in every theme, including Buzz and Buzz Dark (whose accent is otherwise pinned
// to black/white; only the bars change). Off: the bars use the theme's plain foreground colors in every theme.
//
// Applied as <html data-phone-bars="accent|plain"> plus --phone-bars-accent (an HSL triplet); phone.css reads them.
// The desktop app never sets them, so its (rare) phone-width layout keeps following --primary.
import * as React from "react";
import { isTauri } from "@tauri-apps/api/core";

import { hexToHsl } from "./adaptive-theme";

export const PHONE_BARS_ACCENT_KEY = "buzz.web.phoneBarsAccent";
const NEUTRAL = "neutral";
const HEX = /^#[0-9a-f]{6}$/i;

const listeners = new Set<() => void>();

function isWebRuntime(): boolean {
  try {
    return !isTauri();
  } catch {
    return false;
  }
}

/** The setting itself (default on). */
export function isPhoneBarsAccentOn(): boolean {
  try {
    return globalThis.localStorage?.getItem(PHONE_BARS_ACCENT_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setPhoneBarsAccent(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.removeItem(PHONE_BARS_ACCENT_KEY);
    else globalThis.localStorage?.setItem(PHONE_BARS_ACCENT_KEY, "0");
  } catch {
    /* private mode */
  }
  for (const f of listeners) f();
}

export function subscribePhoneBarsAccent(f: () => void): () => void {
  listeners.add(f);
  const onStorage = (event: StorageEvent) => {
    if (event.key === PHONE_BARS_ACCENT_KEY) f();
  };
  globalThis.addEventListener?.("storage", onStorage);
  return () => {
    listeners.delete(f);
    globalThis.removeEventListener?.("storage", onStorage);
  };
}

export function usePhoneBarsAccent(): boolean {
  return React.useSyncExternalStore(
    subscribePhoneBarsAccent,
    isPhoneBarsAccentOn,
    isPhoneBarsAccentOn,
  );
}

/**
 * The accent the phone bars would use, or null when there is none. Buzz themes: only an accent the user actually
 * picked (their stored choice; the app-wide accent stays pinned). Other themes: the applied accent (stored or the
 * default). Neutral = no accent.
 */
export function resolvePhoneBarsAccent({
  buzzTheme,
  storedAccent,
  defaultAccent,
}: {
  buzzTheme: boolean;
  storedAccent: string | null;
  defaultAccent: string;
}): string | null {
  const accent = buzzTheme ? storedAccent : (storedAccent ?? defaultAccent);
  if (!accent || accent === NEUTRAL || !HEX.test(accent)) return null;
  return accent;
}

/** Write the bars state onto <html>. No-op in the desktop app. */
export function applyPhoneBarsAccent(accent: string | null): void {
  if (typeof document === "undefined" || !isWebRuntime()) return;
  const root = document.documentElement;
  if (accent && isPhoneBarsAccentOn()) {
    root.style.setProperty("--phone-bars-accent", hexToHsl(accent));
    root.setAttribute("data-phone-bars", "accent");
  } else {
    root.style.removeProperty("--phone-bars-accent");
    root.setAttribute("data-phone-bars", "plain");
  }
}
