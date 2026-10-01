import * as React from "react";

import {
  boundThreadLabelStore,
  DEFAULT_THREAD_LABEL_STORE,
  normalizeThreadLabelIcon,
  normalizeThreadLabelName,
  readThreadLabelsStore,
  writeThreadLabelsStore,
  type ThreadLabel,
  type ThreadLabelStore,
} from "./threadLabels";

type Subscriber = () => void;

const listenersByPubkey = new Map<string, Set<Subscriber>>();
const storeByPubkey = new Map<string, ThreadLabelStore>();
let storageListenerBound = false;

function ensureStorageListener(): void {
  if (storageListenerBound || typeof window === "undefined") return;
  storageListenerBound = true;
  window.addEventListener("storage", (event) => {
    if (!event.key?.startsWith("buzz-thread-labels.v1:")) return;
    const pubkey = event.key.slice("buzz-thread-labels.v1:".length);
    if (!pubkey) return;
    storeByPubkey.delete(pubkey);
    const listeners = listenersByPubkey.get(pubkey);
    if (!listeners) return;
    for (const listener of listeners) listener();
  });
}

function getStore(pubkey: string): ThreadLabelStore {
  const cached = storeByPubkey.get(pubkey);
  if (cached) return cached;
  const store = readThreadLabelsStore(pubkey);
  storeByPubkey.set(pubkey, store);
  return store;
}

function setStore(pubkey: string, store: ThreadLabelStore): boolean {
  const bounded = boundThreadLabelStore(store);
  if (!writeThreadLabelsStore(pubkey, bounded)) return false;
  storeByPubkey.set(pubkey, bounded);
  const listeners = listenersByPubkey.get(pubkey);
  if (listeners) {
    for (const listener of listeners) listener();
  }
  return true;
}

function subscribe(pubkey: string, listener: Subscriber): () => void {
  ensureStorageListener();
  let listeners = listenersByPubkey.get(pubkey);
  if (!listeners) {
    listeners = new Set();
    listenersByPubkey.set(pubkey, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners?.delete(listener);
    if (listeners && listeners.size === 0) {
      listenersByPubkey.delete(pubkey);
    }
  };
}

export type ThreadLabelPatch = {
  name: string;
  icon?: string;
};

/**
 * Identity-scoped thread titles and starred-row icons.
 * A missing name leaves the header on "Thread" and the star row on its excerpt.
 */
export function useThreadLabels(pubkey: string | undefined): {
  labelFor: (rootId: string) => ThreadLabel | undefined;
  setThreadLabel: (rootId: string, patch: ThreadLabelPatch) => void;
} {
  const store = React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => {
        if (!pubkey) return () => {};
        return subscribe(pubkey, onStoreChange);
      },
      [pubkey],
    ),
    React.useCallback(
      () => (pubkey ? getStore(pubkey) : DEFAULT_THREAD_LABEL_STORE),
      [pubkey],
    ),
    () => DEFAULT_THREAD_LABEL_STORE,
  );

  const labelFor = React.useCallback(
    (rootId: string) => {
      const id = rootId.trim();
      if (!id) return undefined;
      return store.labels[id];
    },
    [store],
  );

  const setThreadLabel = React.useCallback(
    (rootId: string, patch: ThreadLabelPatch) => {
      if (!pubkey) return;
      const id = rootId.trim();
      if (!id) return;
      const name = normalizeThreadLabelName(patch.name);
      const icon = normalizeThreadLabelIcon(patch.icon);
      const prev = getStore(pubkey);
      const labels = { ...prev.labels };
      if (!name && !icon) {
        delete labels[id];
      } else {
        labels[id] = icon ? { name, icon } : { name };
      }
      setStore(pubkey, boundThreadLabelStore({ version: 1, labels }, id));
    },
    [pubkey],
  );

  return { labelFor, setThreadLabel };
}

/** Test helper: drop the in-memory cache so the next read hits storage. */
export function __resetThreadLabelsCacheForTests(): void {
  storeByPubkey.clear();
}
