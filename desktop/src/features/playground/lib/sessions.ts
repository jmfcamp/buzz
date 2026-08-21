import { getStorageItem, setStorageItem } from "@/shared/lib/safeStorage";
import { hideAllPinWebviews } from "@/features/pinned-sites/lib/pinWebview";
import type { PlaygroundCard } from "./types";
import { playgroundSessionsMatchingCard } from "./updates";
import {
  closeAllPlaygroundWebviews,
  closePlaygroundWebview,
  hideAllPlaygroundWebviews,
  hidePlaygroundWebview,
} from "./webview";

export const PLAYGROUND_STORAGE_VERSION = "v1";

export type PlaygroundSession = {
  sid: string;
  name: string;
  url: string;
  pin?: string;
  stack?: string;
  expires?: string;
  hasUpdate?: boolean;
};

type PlaygroundStore = {
  sessions: Map<string, PlaygroundSession>;
  overlaySid: string | null;
};

const store: PlaygroundStore = {
  sessions: new Map(),
  overlaySid: null,
};

let currentScope: string | null = null;
let cachedSnapshot: PlaygroundStore = {
  sessions: new Map(),
  overlaySid: null,
};
const listeners = new Set<() => void>();

function snapshot(): PlaygroundStore {
  return {
    sessions: new Map(store.sessions),
    overlaySid: store.overlaySid,
  };
}

function emit() {
  cachedSnapshot = snapshot();
  for (const listener of listeners) listener();
}

function persist() {
  if (!currentScope) return;
  setStorageItem(
    currentScope,
    JSON.stringify({
      sessions: [...store.sessions.values()],
      overlaySid: store.overlaySid,
    }),
  );
}

function cardToSession(card: PlaygroundCard): PlaygroundSession {
  return {
    sid: card.sid,
    name: card.name,
    url: card.url,
    ...(card.pin ? { pin: card.pin } : {}),
    ...(card.stack ? { stack: card.stack } : {}),
    ...(card.expires != null ? { expires: String(card.expires) } : {}),
    hasUpdate: false,
  };
}

export function playgroundStorageKey(pubkey: string, relayUrl: string): string {
  return `buzz-playground.${PLAYGROUND_STORAGE_VERSION}:${pubkey}:${relayUrl}`;
}

export function subscribePlayground(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPlaygroundStore(): PlaygroundStore {
  return cachedSnapshot;
}

export function listPlaygroundSessions(): PlaygroundSession[] {
  return [...cachedSnapshot.sessions.values()];
}

export function getActivePlaygroundSid(): string | null {
  return cachedSnapshot.overlaySid;
}

export function configurePlaygroundScope(pubkey: string, relayUrl: string) {
  const key = playgroundStorageKey(pubkey, relayUrl);
  if (currentScope === key) return;
  currentScope = key;
  store.sessions.clear();
  store.overlaySid = null;
  const raw = getStorageItem(key);
  if (raw) {
    try {
      const saved = JSON.parse(raw) as {
        sessions?: PlaygroundSession[];
        overlaySid?: string | null;
      };
      for (const session of saved.sessions ?? []) {
        if (session?.sid && session.name && session.url) {
          store.sessions.set(session.sid, {
            ...session,
            hasUpdate: Boolean(session.hasUpdate),
          });
        }
      }
    } catch {
      // Ignore a corrupt blob; the in-memory store stays empty.
    }
  }
  emit();
}

export function addPlaygroundSession(card: PlaygroundCard): PlaygroundSession {
  const session = cardToSession(card);
  store.sessions.set(session.sid, session);
  store.overlaySid = session.sid;
  persist();
  emit();
  void hideAllPinWebviews();
  return session;
}

/** True when this sid already has a left-menu playground row. */
export function hasPlaygroundSession(sid: string): boolean {
  return store.sessions.has(sid);
}

export function showPlaygroundSession(sid: string) {
  if (!store.sessions.has(sid)) return;
  const session = store.sessions.get(sid);
  if (session) {
    store.sessions.set(sid, { ...session, hasUpdate: false });
  }
  store.overlaySid = sid;
  persist();
  emit();
  void hideAllPinWebviews();
}

export function markPlaygroundUpdate(sid: string) {
  const session = store.sessions.get(sid);
  if (!session || session.hasUpdate) return;
  if (store.overlaySid === sid) return;
  store.sessions.set(sid, { ...session, hasUpdate: true });
  persist();
  emit();
}

export function notePlaygroundCard(card: PlaygroundCard) {
  for (const session of playgroundSessionsMatchingCard(
    card,
    store.sessions.values(),
  )) {
    markPlaygroundUpdate(session.sid);
  }
}

/**
 * Park the overlay, then run a left-nav destination. Safe when no overlay
 * is open. Does not dispose the session row.
 */
export function parkPlaygroundThen(select: () => void): () => void {
  return () => {
    dismissPlayground();
    select();
  };
}

export function dismissPlayground() {
  const sid = store.overlaySid;
  store.overlaySid = null;
  persist();
  emit();
  if (sid) void hidePlaygroundWebview(sid);
  notifyPinRestore();
}

export function disposePlayground(sid: string) {
  store.sessions.delete(sid);
  if (store.overlaySid === sid) store.overlaySid = null;
  persist();
  emit();
  void closePlaygroundWebview(sid);
  notifyPinRestore();
}

function notifyPinRestore() {
  if (typeof window === "undefined") return;
  if (typeof window.dispatchEvent !== "function") return;
  const EventCtor = window.Event;
  if (typeof EventCtor !== "function") return;
  try {
    window.dispatchEvent(new EventCtor("buzz:pin-webview-restore"));
  } catch {
    // Node test hosts may lack a DOM Event implementation.
  }
}

export function resetPlaygroundState() {
  currentScope = null;
  store.sessions.clear();
  store.overlaySid = null;
  emit();
  void hideAllPlaygroundWebviews();
  void closeAllPlaygroundWebviews();
}

if (import.meta.env.MODE === "test") {
  (
    globalThis as { __BUZZ_PLAYGROUND_TEST__?: unknown }
  ).__BUZZ_PLAYGROUND_TEST__ = {
    addPlaygroundSession,
    hasPlaygroundSession,
    parkPlaygroundThen,
    showPlaygroundSession,
    dismissPlayground,
    disposePlayground,
    listPlaygroundSessions,
    getActivePlaygroundSid,
    configurePlaygroundScope,
    resetPlaygroundState,
    playgroundStorageKey,
    markPlaygroundUpdate,
    notePlaygroundCard,
  };
}
