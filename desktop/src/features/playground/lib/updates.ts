import type { PlaygroundCard } from "./types.ts";

type PlaygroundSessionMatch = {
  sid: string;
  name: string;
  stack?: string;
};

export const PLAYGROUND_DOM_HASH_DEBOUNCE_MS = 1500;
export const PLAYGROUND_POLL_INTERVAL_MS = 60_000;
export const PLAYGROUND_DOM_POLL_INTERVAL_MS = 2_000;

/** Same sid, or the same stack/name pair. */
export function playgroundCardMatchesSession(
  card: PlaygroundCard,
  session: PlaygroundSessionMatch,
): boolean {
  if (card.sid === session.sid) {
    return true;
  }
  const cardStack = card.stack ?? "";
  const sessionStack = session.stack ?? "";
  return card.name === session.name && cardStack === sessionStack;
}

export function playgroundSessionsMatchingCard(
  card: PlaygroundCard,
  sessions: Iterable<PlaygroundSessionMatch>,
): PlaygroundSessionMatch[] {
  return [...sessions].filter((session) =>
    playgroundCardMatchesSession(card, session),
  );
}

/**
 * Injected into the playground webview. Hashes a caret/clock-stripped DOM
 * snapshot and stores it on `window` for the host to read. The first settle
 * is marked so the host can ignore the initial load.
 */
export const PLAYGROUND_DOM_PROBE_SCRIPT = [
  "(() => {",
  "  if (window.__BUZZ_PLAYGROUND_PROBE__) return;",
  "  window.__BUZZ_PLAYGROUND_PROBE__ = true;",
  "  window.__BUZZ_PLAYGROUND_DOM_HASH__ = null;",
  "  window.__BUZZ_PLAYGROUND_DOM_READY__ = false;",
  "  const ignore = \"time,input,textarea,[contenteditable='true'],[data-clock]\";",
  "  const snapshot = () => {",
  "    const root = document.body ? document.body.cloneNode(true) : null;",
  "    if (!(root instanceof Element)) return '';",
  "    for (const node of root.querySelectorAll(ignore)) node.remove();",
  "    return root.innerHTML;",
  "  };",
  "  const hex = async (text) => {",
  "    const bytes = new TextEncoder().encode(text);",
  "    const digest = await crypto.subtle.digest('SHA-256', bytes);",
  "    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');",
  "  };",
  "  let timer = 0;",
  "  const settle = () => {",
  "    window.clearTimeout(timer);",
  "    timer = window.setTimeout(async () => {",
  "      try {",
  "        window.__BUZZ_PLAYGROUND_DOM_HASH__ = await hex(snapshot());",
  "        window.__BUZZ_PLAYGROUND_DOM_READY__ = true;",
  "        try {",
  "          document.cookie = '__buzz_pg_dom=' + window.__BUZZ_PLAYGROUND_DOM_HASH__ + '; path=/; max-age=3600';",
  "        } catch (e) {}",
  "      } catch (e) {}",
  "    }, " + String(PLAYGROUND_DOM_HASH_DEBOUNCE_MS) + ");",
  "  };",
  "  const observer = new MutationObserver(settle);",
  "  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });",
  "  settle();",
  "})();",
].join("\n");

export const PLAYGROUND_DOM_HASH_READ_SCRIPT =
  "(() => JSON.stringify({ hash: window.__BUZZ_PLAYGROUND_DOM_HASH__ ?? null, ready: Boolean(window.__BUZZ_PLAYGROUND_DOM_READY__) }))()";

export type PlaygroundDomHashState = {
  hash: string | null;
  ready: boolean;
};

export function parsePlaygroundDomHash(
  raw: string,
): PlaygroundDomHashState | null {
  try {
    const value = JSON.parse(raw) as {
      hash?: string | null;
      ready?: boolean;
    };
    return {
      hash: typeof value.hash === "string" ? value.hash : null,
      ready: value.ready === true,
    };
  } catch {
    return null;
  }
}

/**
 * First ready hash is the baseline (no chip). Later hashes light the chip.
 * Returns whether the session should be marked updated.
 */
export function nextPlaygroundDomUpdate(
  previous: string | null,
  current: PlaygroundDomHashState | null,
): { baseline: string | null; changed: boolean } {
  if (!current?.ready || !current.hash) {
    return { baseline: previous, changed: false };
  }
  if (previous == null) {
    return { baseline: current.hash, changed: false };
  }
  return {
    baseline: current.hash,
    changed: previous !== current.hash,
  };
}
