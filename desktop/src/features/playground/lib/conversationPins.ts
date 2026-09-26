import { getStorageItem, setStorageItem } from "@/shared/lib/safeStorage";

import type { PlaygroundCard } from "./types";

export const PLAYGROUND_PINS_STORAGE_VERSION = "v1";

export type ConversationPlaygroundPin = {
  sid: string;
  name: string;
  url: string;
  /** Channel that owned the pin (needed to navigate from thread scopes). */
  channelId?: string;
  pin?: string;
  stack?: string;
  expires?: string;
};

type PinsByScope = Map<string, Map<string, ConversationPlaygroundPin>>;

const pinsByScope: PinsByScope = new Map();
const listeners = new Set<() => void>();
let pinsRevision = 0;
/** Persisted under the same pubkey+relay identity as playground sessions. */
let currentScope: string | null = null;

type MenuOpenRequest = { scopeKey: string; nonce: number };
let menuOpenRequest: MenuOpenRequest | null = null;
let menuOpenNonce = 0;
const menuOpenListeners = new Set<() => void>();

/** Shared empty snapshot — stable Object.is for useSyncExternalStore. */
const EMPTY_PINS: ConversationPlaygroundPin[] = [];
/** Per-scope list snapshots so channel + thread menus can subscribe together. */
const pinsSnapshotByScope = new Map<string, ConversationPlaygroundPin[]>();

function emitPins() {
  pinsRevision += 1;
  pinsSnapshotByScope.clear();
  for (const listener of listeners) listener();
}

function persistPins() {
  if (!currentScope) return;
  const scopes: Record<string, ConversationPlaygroundPin[]> = {};
  for (const [scopeKey, scope] of pinsByScope) {
    if (scope.size === 0) continue;
    scopes[scopeKey] = [...scope.values()];
  }
  setStorageItem(currentScope, JSON.stringify({ scopes }));
}

function normalizePin(
  pin: ConversationPlaygroundPin,
): ConversationPlaygroundPin | null {
  const sid = pin?.sid?.trim() ?? "";
  if (!sid || !pin.name || !pin.url) return null;
  return {
    sid,
    name: pin.name,
    url: pin.url,
    ...(pin.channelId?.trim() ? { channelId: pin.channelId.trim() } : {}),
    ...(pin.pin ? { pin: pin.pin } : {}),
    ...(pin.stack ? { stack: pin.stack } : {}),
    ...(pin.expires != null ? { expires: String(pin.expires) } : {}),
  };
}

function toLiveSidSet(
  liveSids?: ReadonlySet<string> | Iterable<string> | null,
): Set<string> | null {
  if (liveSids == null) return null;
  const set = liveSids instanceof Set ? liveSids : new Set(liveSids);
  return set;
}

/**
 * Drop pins whose sid is not in the live Browsers/playground session set.
 * Keeps channel/thread pins tied to an existing browser row across restarts.
 */
export function pruneConversationPlaygroundPinsToSids(
  liveSids: ReadonlySet<string> | Iterable<string>,
): number {
  const allowed = toLiveSidSet(liveSids) ?? new Set<string>();
  let removed = 0;
  for (const [scopeKey, scope] of [...pinsByScope.entries()]) {
    for (const sid of [...scope.keys()]) {
      if (allowed.has(sid)) continue;
      scope.delete(sid);
      removed += 1;
    }
    if (scope.size === 0) pinsByScope.delete(scopeKey);
  }
  if (removed > 0) {
    persistPins();
    emitPins();
  }
  return removed;
}

export function getConversationPlaygroundPinsRevision(): number {
  return pinsRevision;
}

function emitMenuOpen() {
  for (const listener of menuOpenListeners) listener();
}

function cardToPin(
  card: PlaygroundCard,
  channelId?: string | null,
): ConversationPlaygroundPin {
  return {
    sid: card.sid,
    name: card.name,
    url: card.url,
    ...(channelId?.trim() ? { channelId: channelId.trim() } : {}),
    ...(card.pin ? { pin: card.pin } : {}),
    ...(card.stack ? { stack: card.stack } : {}),
    ...(card.expires != null ? { expires: String(card.expires) } : {}),
  };
}

/**
 * Native pin-webview id kept alive for a conversation playground pin.
 * Must match pin_webview::sanitize_pin_id (ascii alnum / - / _) — a colon
 * here made header-pin opens fail with "invalid pin id" → Failed to open link.
 */
export function conversationPlaygroundPinWebviewId(sid: string): string {
  return `playground-pin-${sid}`;
}

export function playgroundPinsStorageKey(
  pubkey: string,
  relayUrl: string,
): string {
  return `buzz-playground-pins.${PLAYGROUND_PINS_STORAGE_VERSION}:${pubkey}:${relayUrl}`;
}

/**
 * Load (or switch) persisted channel/thread pins for this identity.
 * When `liveSids` is provided, orphan pins (no matching playground session)
 * are dropped so restarts never leave pins for deleted browsers.
 */
export function configureConversationPlaygroundPinsScope(
  pubkey: string,
  relayUrl: string,
  liveSids?: ReadonlySet<string> | Iterable<string> | null,
): void {
  const key = playgroundPinsStorageKey(pubkey, relayUrl);
  if (currentScope === key) {
    if (liveSids != null) pruneConversationPlaygroundPinsToSids(liveSids);
    return;
  }
  currentScope = key;
  pinsByScope.clear();
  pinsSnapshotByScope.clear();
  const raw = getStorageItem(key);
  if (raw) {
    try {
      const saved = JSON.parse(raw) as {
        scopes?: Record<string, ConversationPlaygroundPin[]>;
      };
      const scopes = saved.scopes ?? {};
      for (const [scopeKey, pins] of Object.entries(scopes)) {
        const trimmed = scopeKey.trim();
        if (!trimmed || !Array.isArray(pins)) continue;
        const scope = new Map<string, ConversationPlaygroundPin>();
        for (const entry of pins) {
          const pin = normalizePin(entry);
          if (!pin) continue;
          scope.set(pin.sid, pin);
        }
        if (scope.size > 0) pinsByScope.set(trimmed, scope);
      }
    } catch {
      // Corrupt blob → empty in-memory store.
    }
  }
  if (liveSids != null) {
    const allowed = toLiveSidSet(liveSids) ?? new Set<string>();
    for (const [scopeKey, scope] of [...pinsByScope.entries()]) {
      for (const sid of [...scope.keys()]) {
        if (!allowed.has(sid)) scope.delete(sid);
      }
      if (scope.size === 0) pinsByScope.delete(scopeKey);
    }
    // Rewrite storage after prune so orphans do not resurrect next launch.
    persistPins();
  }
  emitPins();
}

export function subscribeConversationPlaygroundPins(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function listConversationPlaygroundPins(
  scopeKey: string,
): ConversationPlaygroundPin[] {
  const cached = pinsSnapshotByScope.get(scopeKey);
  if (cached) return cached;
  const scope = pinsByScope.get(scopeKey);
  const snapshot = scope && scope.size > 0 ? [...scope.values()] : EMPTY_PINS;
  pinsSnapshotByScope.set(scopeKey, snapshot);
  return snapshot;
}

export function hasConversationPlaygroundPin(
  scopeKey: string,
  sid: string,
): boolean {
  return pinsByScope.get(scopeKey)?.has(sid) ?? false;
}

/**
 * Hydrate pins into a companion window (or tests). Idempotent per sid.
 * Does not clear existing pins outside the provided list.
 */
export function seedConversationPlaygroundPins(
  scopeKey: string,
  pins: readonly ConversationPlaygroundPin[],
): void {
  const trimmed = scopeKey.trim();
  if (!trimmed || pins.length === 0) return;
  let scope = pinsByScope.get(trimmed);
  if (!scope) {
    scope = new Map();
    pinsByScope.set(trimmed, scope);
  }
  let changed = false;
  for (const pin of pins) {
    const next = normalizePin(pin);
    if (!next) continue;
    scope.set(next.sid, next);
    changed = true;
  }
  if (changed) {
    persistPins();
    emitPins();
  }
}

/**
 * Add (or refresh) a named playground pin under a channel/thread scope.
 * Persisted with playground sessions when a scope is configured. Does not
 * open a slide-out or overlay.
 */
export function pinPlaygroundToConversation(
  scopeKey: string,
  card: PlaygroundCard,
  channelId?: string | null,
): ConversationPlaygroundPin {
  const trimmed = scopeKey.trim();
  if (!trimmed) {
    throw new Error("Missing playground pin scope.");
  }
  let scope = pinsByScope.get(trimmed);
  if (!scope) {
    scope = new Map();
    pinsByScope.set(trimmed, scope);
  }
  const pin = cardToPin(card, channelId);
  scope.set(pin.sid, pin);
  persistPins();
  emitPins();
  return pin;
}

export type ConversationPinBinding = {
  scopeKey: string;
  channelId: string | null;
  threadRoot: string | null;
};

/** Scopes where this playground sid is pinned (for Browsers list navigation). */
export function listConversationPinBindingsForSid(
  sid: string,
): ConversationPinBinding[] {
  const trimmed = sid.trim();
  if (!trimmed) return [];
  const out: ConversationPinBinding[] = [];
  for (const [scopeKey, scope] of pinsByScope) {
    const pin = scope.get(trimmed);
    if (!pin) continue;
    if (scopeKey.startsWith("thread:")) {
      out.push({
        scopeKey,
        channelId: pin.channelId?.trim() || null,
        threadRoot: scopeKey.slice("thread:".length) || null,
      });
      continue;
    }
    if (scopeKey.startsWith("channel:")) {
      out.push({
        scopeKey,
        channelId: scopeKey.slice("channel:".length) || pin.channelId || null,
        threadRoot: null,
      });
    }
  }
  return out;
}

export function unpinPlaygroundFromConversation(
  scopeKey: string,
  sid: string,
): ConversationPlaygroundPin | null {
  const scope = pinsByScope.get(scopeKey);
  if (!scope) return null;
  const existing = scope.get(sid) ?? null;
  if (!existing) return null;
  scope.delete(sid);
  if (scope.size === 0) pinsByScope.delete(scopeKey);
  persistPins();
  emitPins();
  return existing;
}

/**
 * Remove this playground sid from every channel/thread pin scope.
 * Call when the Browsers row / playground session is disposed so pins do not
 * orphan after Remove.
 */
export function unpinPlaygroundSessionEverywhere(sid: string): number {
  const trimmed = sid.trim();
  if (!trimmed) return 0;
  let removed = 0;
  for (const [scopeKey, scope] of [...pinsByScope.entries()]) {
    if (!scope.has(trimmed)) continue;
    scope.delete(trimmed);
    removed += 1;
    if (scope.size === 0) pinsByScope.delete(scopeKey);
  }
  if (removed > 0) {
    persistPins();
    emitPins();
  }
  return removed;
}

export function requestOpenConversationPlaygroundPinsMenu(
  scopeKey: string,
): void {
  menuOpenNonce += 1;
  menuOpenRequest = { scopeKey, nonce: menuOpenNonce };
  emitMenuOpen();
}

export function subscribeConversationPlaygroundPinsMenu(
  listener: () => void,
): () => void {
  menuOpenListeners.add(listener);
  return () => {
    menuOpenListeners.delete(listener);
  };
}

export function getConversationPlaygroundPinsMenuOpenRequest(): MenuOpenRequest | null {
  return menuOpenRequest;
}

/** Test helper — wipe in-memory pins and menu-open requests (keeps storage). */
export function resetConversationPlaygroundPins(): void {
  currentScope = null;
  pinsByScope.clear();
  pinsSnapshotByScope.clear();
  menuOpenRequest = null;
  emitPins();
  emitMenuOpen();
}
