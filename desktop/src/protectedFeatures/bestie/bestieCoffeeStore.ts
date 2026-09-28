import * as React from "react";

import { bestieOwnerScopeKey } from "./bestieOwnerScope";

import {
  abandonBestieCoffeeRun,
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
import {
  BESTIE_COFFEE_ABANDONED_OUTPUT,
  replyParentIdFromEventTags,
} from "./bestieCoffeeLive";
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
  return bestieOwnerScopeKey(scope);
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

/** Finalize or clear a stale/abandoned pending brew so UI cannot stick on 👀. */
export function abandonBestieCoffeePendingForScope(
  scope: BestieCoffeeScope,
  fullOutput: string = BESTIE_COFFEE_ABANDONED_OUTPUT,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieCoffeeState {
  return commit(
    scope,
    abandonBestieCoffeeRun(loadState(scope), fullOutput, nowSeconds),
  );
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
 * Capture an agent reply into a Coffee tab entry.
 *
 * Records **all** outcomes (briefs, failures, NCP-disabled, errors) when the
 * agent message replies to a coffee trigger — never Thread Summarize / job /
 * other Assistant turns. Prefer pendingRun + bound triggerMessageId; also
 * fold replies to unmatched coffee triggers when pending was lost.
 */
export function applyBestieCoffeeAgentReply(
  scope: BestieCoffeeScope,
  messageId: string,
  content: string,
  createdAtSeconds: number,
  tags?: readonly (readonly string[])[] | null,
  /**
   * Optional map of coffee trigger message id → source, for capture when
   * pendingRun was cleared or never set (manual /hula-coffee).
   */
  unmatchedCoffeeTriggers?: ReadonlyMap<string, "scheduled" | "brew">,
): boolean {
  const current = loadState(scope);
  const trimmed = content.trim();
  if (!trimmed) return false;

  // Already captured this agent message.
  if (current.entries.some((entry) => entry.replyMessageId === messageId)) {
    return false;
  }

  const parentId = replyParentIdFromEventTags(tags);
  const pending = current.pendingRun;

  // Path A: pending run with bound trigger — only the in-thread coffee reply.
  if (pending?.triggerMessageId) {
    if (createdAtSeconds + 5 < pending.startedAt) return false;
    if (parentId !== pending.triggerMessageId) return false;
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

  // Path B: pending without trigger id yet — wait for bind (avoid stealing
  // summarize/job replies that arrive while the coffee trigger is still unset).
  if (pending && !pending.triggerMessageId) {
    return false;
  }

  // Path C: no pending — capture reply to an unmatched coffee trigger so error
  // / NCP / brief outcomes still land in the Coffee tab.
  if (parentId && unmatchedCoffeeTriggers?.has(parentId)) {
    if (current.entries.some((entry) => entry.triggerMessageId === parentId)) {
      return false;
    }
    const source = unmatchedCoffeeTriggers.get(parentId) ?? "brew";
    completeBestieCoffeeRunForScope(
      scope,
      {
        brief: "",
        fullOutput: trimmed,
        replyMessageId: messageId,
        source,
        triggerMessageId: parentId,
      },
      createdAtSeconds,
    );
    return true;
  }

  return false;
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

/** Test helper: drop cached in-memory coffee state. */
export function __resetBestieCoffeeStoreForTests(): void {
  stateByKey.clear();
  listenersByKey.clear();
}

