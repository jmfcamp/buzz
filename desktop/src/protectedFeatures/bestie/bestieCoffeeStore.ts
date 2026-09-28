import * as React from "react";

import {
  beginBestieCoffeeRun,
  clearBestieCoffeePendingRun,
  completeBestieCoffeeRun,
  EMPTY_BESTIE_COFFEE_STATE,
  readBestieCoffeeState,
  removeBestieCoffeeEntry,
  setBestieCoffeePendingTrigger,
  setBestieCoffeePrefs,
  writeBestieCoffeeState,
} from "./bestieCoffeeStorage";
import type {
  BestieCoffeeAddEntryInput,
  BestieCoffeePrefs,
  BestieCoffeeRunSource,
  BestieCoffeeScope,
  BestieCoffeeState,
} from "./bestieCoffeeTypes";

type Listener = () => void;

const listenersByKey = new Map<string, Set<Listener>>();
const stateByKey = new Map<string, BestieCoffeeState>();

function scopeKey(scope: BestieCoffeeScope): string {
  return [
    scope.relayUrl.trim().toLowerCase(),
    scope.ownerPubkey.toLowerCase(),
    scope.agentPubkey.toLowerCase(),
  ].join(":");
}

function notify(key: string) {
  const listeners = listenersByKey.get(key);
  if (!listeners) return;
  for (const listener of listeners) listener();
}

function loadState(scope: BestieCoffeeScope): BestieCoffeeState {
  const key = scopeKey(scope);
  const cached = stateByKey.get(key);
  if (cached) return cached;
  const loaded = readBestieCoffeeState(scope);
  stateByKey.set(key, loaded);
  return loaded;
}

function commit(
  scope: BestieCoffeeScope,
  next: BestieCoffeeState,
): BestieCoffeeState {
  const key = scopeKey(scope);
  stateByKey.set(key, next);
  writeBestieCoffeeState(scope, next);
  notify(key);
  return next;
}

export function getBestieCoffeeState(
  scope: BestieCoffeeScope,
): BestieCoffeeState {
  return loadState(scope);
}

export function setBestieCoffeePrefsForScope(
  scope: BestieCoffeeScope,
  prefs: Partial<BestieCoffeePrefs>,
): BestieCoffeeState {
  return commit(scope, setBestieCoffeePrefs(loadState(scope), prefs));
}

/** Begin a brew/scheduled run; returns null if already brewing. */
export function beginBestieCoffeeRunForScope(
  scope: BestieCoffeeScope,
  source: BestieCoffeeRunSource,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieCoffeeState | null {
  const next = beginBestieCoffeeRun(loadState(scope), source, nowSeconds);
  if (!next) return null;
  return commit(scope, next);
}

export function setBestieCoffeePendingTriggerForScope(
  scope: BestieCoffeeScope,
  triggerMessageId: string | null,
): BestieCoffeeState {
  return commit(
    scope,
    setBestieCoffeePendingTrigger(loadState(scope), triggerMessageId),
  );
}

export function clearBestieCoffeePendingRunForScope(
  scope: BestieCoffeeScope,
): BestieCoffeeState {
  return commit(scope, clearBestieCoffeePendingRun(loadState(scope)));
}

export function completeBestieCoffeeRunForScope(
  scope: BestieCoffeeScope,
  input: BestieCoffeeAddEntryInput,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieCoffeeState {
  return commit(
    scope,
    completeBestieCoffeeRun(loadState(scope), input, nowSeconds),
  );
}

export function removeBestieCoffeeEntryForScope(
  scope: BestieCoffeeScope,
  id: string,
): BestieCoffeeState {
  return commit(scope, removeBestieCoffeeEntry(loadState(scope), id));
}

/**
 * Capture an agent reply into a coffee entry when a pending run is waiting.
 * Returns true when the message completed a pending brew.
 */
export function applyBestieCoffeeAgentReply(
  scope: BestieCoffeeScope,
  messageId: string,
  content: string,
  createdAtSeconds: number,
): boolean {
  const current = loadState(scope);
  const pending = current.pendingRun;
  if (!pending) return false;
  // Ignore replies that clearly precede the run start (clock skew buffer 5s).
  if (createdAtSeconds + 5 < pending.startedAt) return false;
  const trimmed = content.trim();
  if (!trimmed) return false;
  completeBestieCoffeeRunForScope(
    scope,
    {
      brief: "",
      fullOutput: trimmed,
      replyMessageId: messageId,
      source: pending.source,
      triggerMessageId: pending.triggerMessageId,
    },
    Math.max(createdAtSeconds, pending.startedAt),
  );
  return true;
}

export function useBestieCoffee(
  scope: BestieCoffeeScope | null,
): BestieCoffeeState {
  const key = scope ? scopeKey(scope) : null;
  const subscribe = React.useCallback(
    (listener: Listener) => {
      if (!key) return () => {};
      let set = listenersByKey.get(key);
      if (!set) {
        set = new Set();
        listenersByKey.set(key, set);
      }
      set.add(listener);
      return () => {
        set?.delete(listener);
        if (set && set.size === 0) listenersByKey.delete(key);
      };
    },
    [key],
  );
  const getSnapshot = React.useCallback(() => {
    if (!scope) return EMPTY_BESTIE_COFFEE_STATE;
    return loadState(scope);
  }, [scope]);
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
