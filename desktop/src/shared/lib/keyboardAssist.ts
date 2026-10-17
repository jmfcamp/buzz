// "Keyboard autocorrect & suggestions" (Settings > Appearance > Preferences, web only). Saved on this device.
//
// Off (the default) keeps the long-standing attributes: no autocorrect, no auto-capitalization and no QuickType
// suggestions in the composer. On lets the phone/browser keyboard correct, capitalize and suggest in prose fields
// (message composers and message search). Identifier fields (keys, URLs, names, slugs, invite links) never change.
// Buzz Term never reads this: its inputs always use TERMINAL_KEYBOARD_PROPS below. The desktop app ignores it.
import * as React from "react";
import { isTauri } from "@tauri-apps/api/core";

export const KEYBOARD_ASSIST_KEY = "buzz.web.keyboardAssist";

const listeners = new Set<() => void>();

function isWebRuntime(): boolean {
  try {
    return !isTauri();
  } catch {
    return false;
  }
}

/** True only on web with the setting on. Always false in the desktop app. */
export function isKeyboardAssistOn(): boolean {
  if (!isWebRuntime()) return false;
  try {
    return globalThis.localStorage?.getItem(KEYBOARD_ASSIST_KEY) === "1";
  } catch {
    return false;
  }
}

export function setKeyboardAssist(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(KEYBOARD_ASSIST_KEY, "1");
    else globalThis.localStorage?.removeItem(KEYBOARD_ASSIST_KEY);
  } catch {
    /* private mode */
  }
  for (const f of listeners) f();
}

export function subscribeKeyboardAssist(f: () => void): () => void {
  listeners.add(f);
  // Another tab of the PWA changed it.
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEYBOARD_ASSIST_KEY) f();
  };
  globalThis.addEventListener?.("storage", onStorage);
  return () => {
    listeners.delete(f);
    globalThis.removeEventListener?.("storage", onStorage);
  };
}

export function useKeyboardAssist(): boolean {
  return React.useSyncExternalStore(
    subscribeKeyboardAssist,
    isKeyboardAssistOn,
    isKeyboardAssistOn,
  );
}

/** ProseMirror DOM attributes for the message composer. Off = the composer's attributes before this setting existed. */
export function composerKeyboardAttrs(on: boolean): Record<string, string> {
  return on
    ? { autocapitalize: "sentences", autocorrect: "on", spellcheck: "true" }
    : { autocapitalize: "none", autocorrect: "off", spellcheck: "true" };
}

/**
 * React props for message search. Capitalization stays off even when on, so `from:` / `in:` operators and @names
 * aren't capitalized.
 */
export function searchKeyboardProps(on: boolean) {
  return on
    ? ({
        autoCapitalize: "none",
        autoComplete: "off",
        autoCorrect: "on",
        spellCheck: true,
      } as const)
    : ({
        autoCapitalize: "none",
        autoCorrect: "off",
        spellCheck: false,
      } as const);
}

/** Buzz Term inputs: always off, whatever the setting says. */
export const TERMINAL_KEYBOARD_PROPS = Object.freeze({
  autoCapitalize: "off",
  autoComplete: "off",
  autoCorrect: "off",
  spellCheck: false,
} as const);
