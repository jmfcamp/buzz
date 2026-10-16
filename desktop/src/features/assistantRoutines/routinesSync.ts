// Relay sync + in-memory store for Assistant Routines (routinesDoc.ts). Same engine and lifecycle as the Assistant
// lists doc: one encrypted kind 30078 per owner on the community relay, warm-started from localStorage.
import * as React from "react";

import { SyncedDoc, type SyncedDocCodec } from "@/shared/lib/syncedDoc";

import {
  ASSISTANT_ROUTINES_D_TAG,
  ASSISTANT_ROUTINES_KIND,
  emptyRoutinesDoc,
  listRoutines,
  mergeRoutinesDoc,
  parseRoutinesDoc,
  pruneRoutinesDoc,
  type Routine,
  type RoutinesDoc,
  sameRoutinesDoc,
} from "./routinesDoc";

const CACHE_PREFIX = "buzz-assistant-routines.v1";
const nowSec = () => Math.floor(Date.now() / 1000);

const codec: SyncedDocCodec<RoutinesDoc> = {
  empty: emptyRoutinesDoc,
  parse: parseRoutinesDoc,
  merge: mergeRoutinesDoc,
  prune: pruneRoutinesDoc,
  same: sameRoutinesDoc,
};

let active: SyncedDoc<RoutinesDoc> | null = null;
let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version += 1;
  for (const l of listeners) l();
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export function startAssistantRoutinesSync(
  pubkey: string,
  relayUrl: string,
): () => void {
  const pk = pubkey.trim().toLowerCase();
  const sync = new SyncedDoc<RoutinesDoc>({
    pk,
    kind: ASSISTANT_ROUTINES_KIND,
    dTag: ASSISTANT_ROUTINES_D_TAG,
    codec,
    cacheKey: `${CACHE_PREFIX}:${relayUrl.trim().toLowerCase()}:${pk}`,
    debounceMs: 2_000,
    label: "Assistant routines",
    onRemoteChange: emit,
  });
  active = sync;
  emit();
  void sync.start();
  const onHide = () => {
    if (document.visibilityState === "hidden") sync.flush();
  };
  document.addEventListener("visibilitychange", onHide);
  return () => {
    document.removeEventListener("visibilitychange", onHide);
    sync.stop();
    if (active === sync) {
      active = null;
      emit();
    }
  };
}

export function getRoutinesDoc(pubkey: string | undefined): RoutinesDoc | null {
  const pk = pubkey?.trim().toLowerCase();
  return pk && active && active.pk === pk ? active.doc : null;
}

export function getRoutines(pubkey: string | undefined): Routine[] {
  return listRoutines(getRoutinesDoc(pubkey));
}

/** Apply a local edit. False when no sync is running for `pubkey`. */
export function updateRoutines(
  pubkey: string | undefined,
  fn: (doc: RoutinesDoc, now: number) => RoutinesDoc,
): boolean {
  const pk = pubkey?.trim().toLowerCase();
  if (!pk || !active || active.pk !== pk) return false;
  const next = fn(active.doc, nowSec());
  if (next !== active.doc) {
    active.update(next);
    emit();
  }
  return true;
}

/** Null while no sync runs for `pubkey` (signed out / other identity). */
export function useAssistantRoutines(
  pubkey: string | undefined,
): Routine[] | null {
  React.useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  const doc = getRoutinesDoc(pubkey);
  return doc ? listRoutines(doc) : null;
}
