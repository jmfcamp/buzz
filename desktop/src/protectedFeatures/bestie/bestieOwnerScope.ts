import { canonicalRelayUrl } from "@/features/agents/managedAgentRuntimeStatus";

/** Persistence scope: survives agent reassignment (relay + owner only). */
export type BestieOwnerScope = {
  ownerPubkey: string;
  relayUrl: string;
};

/**
 * Build `prefix:relay:owner` localStorage key (no agent id).
 * Legacy agent-scoped keys were `prefix:relay:owner:agent`.
 */
export function bestieOwnerStorageKey(
  prefix: string,
  scope: BestieOwnerScope,
): string {
  const relay =
    canonicalRelayUrl(scope.relayUrl) ?? scope.relayUrl.trim().toLowerCase();
  return [prefix, relay, scope.ownerPubkey.toLowerCase()].join(":");
}

/** In-memory store key matching owner-scoped persistence. */
export function bestieOwnerScopeKey(scope: BestieOwnerScope): string {
  return [
    scope.relayUrl.trim().toLowerCase(),
    scope.ownerPubkey.toLowerCase(),
  ].join(":");
}

/**
 * Prefix for legacy agent-scoped keys under the same relay+owner
 * (`ownerKey + ":"`).
 */
export function bestieLegacyAgentStorageKeyPrefix(
  prefix: string,
  scope: BestieOwnerScope,
): string {
  return `${bestieOwnerStorageKey(prefix, scope)}:`;
}

type LocalStorageLike = {
  getItem(key: string): string | null;
  key(index: number): string | null;
  readonly length: number;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
};

function storage(): LocalStorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Read owner-scoped JSON state. If the new key is empty, merge/migrate any
 * legacy `prefix:relay:owner:agent` entries, write the new key, and drop
 * legacy keys.
 */
export function readOwnerScopedState<T>(options: {
  empty: () => T;
  isEmpty: (state: T) => boolean;
  merge: (into: T, from: T) => T;
  parse: (value: unknown) => T | null;
  prefix: string;
  scope: BestieOwnerScope;
}): T {
  const store = storage();
  if (!store) return options.empty();
  const key = bestieOwnerStorageKey(options.prefix, options.scope);
  try {
    const raw = store.getItem(key);
    if (raw) {
      const parsed = options.parse(JSON.parse(raw));
      if (parsed && !options.isEmpty(parsed)) return parsed;
      if (parsed) {
        // Empty new key still — try migrate then return empty/merged.
      }
    }
  } catch {
    // fall through to migrate
  }

  const legacyPrefix = bestieLegacyAgentStorageKeyPrefix(
    options.prefix,
    options.scope,
  );
  let merged = options.empty();
  const legacyKeys: string[] = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const candidate = store.key(i);
      if (!candidate || !candidate.startsWith(legacyPrefix)) continue;
      legacyKeys.push(candidate);
      try {
        const raw = store.getItem(candidate);
        if (!raw) continue;
        const parsed = options.parse(JSON.parse(raw));
        if (parsed) merged = options.merge(merged, parsed);
      } catch {
        // skip corrupt legacy blob
      }
    }
  } catch {
    return options.empty();
  }

  if (options.isEmpty(merged)) {
    return options.empty();
  }

  try {
    store.setItem(key, JSON.stringify(merged));
    for (const legacyKey of legacyKeys) {
      store.removeItem(legacyKey);
    }
  } catch {
    // Quota / private mode — still return migrated in-memory state.
  }
  return merged;
}

export function writeOwnerScopedState(
  prefix: string,
  scope: BestieOwnerScope,
  state: unknown,
): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(bestieOwnerStorageKey(prefix, scope), JSON.stringify(state));
  } catch {
    // Quota / private mode — callers still hold in-memory state.
  }
}
