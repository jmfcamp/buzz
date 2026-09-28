import * as React from "react";

import { bestieOwnerScopeKey } from "./bestieOwnerScope";

import { bestieThreadId } from "./bestieThreadProtocol";
import {
  beginBestieThreadSummarize,
  clearBestieThreadSummarize,
  completeBestieThreadSummarize,
  EMPTY_BESTIE_THREAD_STATE,
  readBestieThreadState,
  removeBestieTrackedThread,
  upsertBestieTrackedThread,
  writeBestieThreadState,
} from "./bestieThreadStorage";
import type {
  BestieThreadScope,
  BestieThreadState,
  BestieThreadUpsertInput,
} from "./bestieThreadTypes";

type Listener = () => void;

const listenersByKey = new Map<string, Set<Listener>>();
const stateByKey = new Map<string, BestieThreadState>();

function scopeKey(scope: BestieThreadScope): string {
  return bestieOwnerScopeKey(scope);
}

function notify(key: string) {
  const listeners = listenersByKey.get(key);
  if (!listeners) return;
  for (const listener of listeners) listener();
}

function loadState(scope: BestieThreadScope): BestieThreadState {
  const key = scopeKey(scope);
  const cached = stateByKey.get(key);
  if (cached) return cached;
  const loaded = readBestieThreadState(scope);
  stateByKey.set(key, loaded);
  return loaded;
}

function commit(
  scope: BestieThreadScope,
  next: BestieThreadState,
): BestieThreadState {
  const key = scopeKey(scope);
  stateByKey.set(key, next);
  writeBestieThreadState(scope, next);
  notify(key);
  return next;
}

export function getBestieThreadState(
  scope: BestieThreadScope,
): BestieThreadState {
  return loadState(scope);
}

export function upsertBestieTrackedThreadForScope(
  scope: BestieThreadScope,
  input: BestieThreadUpsertInput,
): BestieThreadState {
  return commit(scope, upsertBestieTrackedThread(loadState(scope), input));
}

export function removeBestieTrackedThreadForScope(
  scope: BestieThreadScope,
  id: string,
): BestieThreadState {
  return commit(scope, removeBestieTrackedThread(loadState(scope), id));
}

export function beginBestieThreadSummarizeForScope(
  scope: BestieThreadScope,
  threadId: string,
): BestieThreadState | null {
  const next = beginBestieThreadSummarize(loadState(scope), threadId);
  if (!next) return null;
  return commit(scope, next);
}

export function clearBestieThreadSummarizeForScope(
  scope: BestieThreadScope,
): BestieThreadState {
  return commit(scope, clearBestieThreadSummarize(loadState(scope)));
}

export function applyBestieThreadSummarizeReply(
  scope: BestieThreadScope,
  content: string,
  createdAtSeconds: number,
): boolean {
  const current = loadState(scope);
  const pending = current.pendingSummarize;
  if (!pending) return false;
  if (createdAtSeconds + 5 < pending.startedAt) return false;
  const trimmed = content.trim();
  if (!trimmed) return false;
  commit(
    scope,
    completeBestieThreadSummarize(current, trimmed, createdAtSeconds),
  );
  return true;
}


export function syncBestieParticipatingThreadsForScope(
  scope: BestieThreadScope,
  inputs: readonly BestieThreadUpsertInput[],
): BestieThreadState {
  let next = loadState(scope);
  const known = new Set(next.threads.map((thread) => thread.id));
  let changed = false;
  for (const input of inputs) {
    const channelId = input.channelId.trim();
    const rootEventId = input.rootEventId.trim();
    if (!channelId || !rootEventId) continue;
    const id = bestieThreadId(channelId, rootEventId);
    if (known.has(id)) {
      // Already tracked (ask/add/agent) — do not bump lastActiveAt on every sync.
      const existing = next.threads.find((thread) => thread.id === id);
      if (
        existing &&
        existing.source === "ask" &&
        (input.source ?? "agent") === "agent"
      ) {
        next = upsertBestieTrackedThread(next, {
          ...input,
          source: "agent",
        });
        changed = true;
      }
      continue;
    }
    next = upsertBestieTrackedThread(next, {
      ...input,
      source: input.source ?? "agent",
    });
    known.add(id);
    changed = true;
  }
  if (!changed) return next;
  return commit(scope, next);
}

export function useBestieThreads(
  scope: BestieThreadScope | null,
): BestieThreadState {
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
    if (!scope) return EMPTY_BESTIE_THREAD_STATE;
    return loadState(scope);
  }, [scope]);
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
