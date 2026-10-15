// Relay sync for personal thread titles/icons (threadLabelsDoc.ts): kind 30078,
// d=buzz:thread-labels, NIP-44 to self, on the generic synced-doc engine. The
// existing localStorage blob (`buzz-thread-labels.v1:<pubkey>`) stays the warm
// cache every UI reads; this module merges it with the relay doc, rewrites it
// on remote changes, and publishes local edits from useThreadLabels.
import { SyncedDoc, type SyncedDocCodec } from "@/shared/lib/syncedDoc";

import {
  readThreadLabelsStore,
  registerThreadLabelSyncUpdater,
  THREAD_LABELS_APPLIED_EVENT,
  writeThreadLabelsStore,
} from "./threadLabels";
import {
  THREAD_LABELS_D_TAG,
  THREAD_LABELS_KIND,
  emptyThreadLabelsDoc,
  mergeThreadLabelsDoc,
  parseThreadLabelsDoc,
  pruneThreadLabelsDoc,
  sameThreadLabelsDoc,
  setThreadLabelEntry,
  threadLabelStoreFromDoc,
  unionLocalThreadLabels,
  type ThreadLabelsDoc,
} from "./threadLabelsDoc";

export const THREAD_LABELS_PUBLISH_DEBOUNCE_MS = 3_000;
const CACHE_PREFIX = "buzz-thread-labels-doc.v1";
const MIGRATED_PREFIX = "buzz-thread-labels-migrated.v1";

const codec: SyncedDocCodec<ThreadLabelsDoc> = {
  empty: emptyThreadLabelsDoc,
  parse: parseThreadLabelsDoc,
  merge: mergeThreadLabelsDoc,
  prune: pruneThreadLabelsDoc,
  same: sameThreadLabelsDoc,
};

function migratedKey(relayUrl: string, pk: string) {
  return `${MIGRATED_PREFIX}:${relayUrl.trim().toLowerCase()}:${pk}`;
}

function project(pk: string, doc: ThreadLabelsDoc) {
  writeThreadLabelsStore(pk, threadLabelStoreFromDoc(doc));
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(THREAD_LABELS_APPLIED_EVENT, { detail: { pubkey: pk } }),
    );
  }
}

let active: SyncedDoc<ThreadLabelsDoc> | null = null;

function handleLocalUpdate(
  pubkey: string,
  rootId: string,
  patch: { name: string; icon?: string } | null,
): boolean {
  const pk = pubkey.trim().toLowerCase();
  if (!pk || !active || active.pk !== pk) return false;
  const now = Math.floor(Date.now() / 1000);
  const next = setThreadLabelEntry(active.doc, rootId, patch, now);
  if (sameThreadLabelsDoc(next, active.doc)) return true;
  active.update(next);
  project(pk, active.doc);
  return true;
}

/** Start (or restart on community/identity switch) sync for `pubkey`. */
export function startThreadLabelsSync(
  pubkey: string,
  relayUrl: string,
): () => void {
  const pk = pubkey.trim().toLowerCase();
  const relay = relayUrl.trim();
  const sync = new SyncedDoc<ThreadLabelsDoc>({
    pk,
    kind: THREAD_LABELS_KIND,
    dTag: THREAD_LABELS_D_TAG,
    codec,
    cacheKey: `${CACHE_PREFIX}:${relay.toLowerCase()}:${pk}`,
    debounceMs: THREAD_LABELS_PUBLISH_DEBOUNCE_MS,
    label: "Thread labels",
    onRemoteChange: (doc) => project(pk, doc),
    onBootstrapNoRemote: (doc) => project(pk, doc),
  });

  // One-time: fold this device's localStorage renames into the doc (at=1 so a
  // real remote stamp beats them). Surface-tabs are untouched.
  try {
    const flag = migratedKey(relay, pk);
    if (!window.localStorage.getItem(flag)) {
      const local = readThreadLabelsStore(pk);
      const merged = unionLocalThreadLabels(sync.doc, local);
      if (!sameThreadLabelsDoc(merged, sync.doc)) {
        sync.doc = merged;
        sync.persist();
      }
      window.localStorage.setItem(flag, String(Math.floor(Date.now() / 1000)));
    }
  } catch {
    /* private mode: sync still runs from memory */
  }

  active = sync;
  registerThreadLabelSyncUpdater(handleLocalUpdate);
  void sync.start();
  // Seed the UI cache from whatever we have (migrated local and/or warm cache).
  project(pk, sync.doc);

  const onHide = () => {
    if (document.visibilityState === "hidden") sync.flush();
  };
  document.addEventListener("visibilitychange", onHide);
  return () => {
    document.removeEventListener("visibilitychange", onHide);
    sync.stop();
    if (active === sync) {
      active = null;
      registerThreadLabelSyncUpdater(null);
    }
  };
}

/** Test helper. */
export function __resetThreadLabelsSyncForTests(): void {
  active?.stop();
  active = null;
  registerThreadLabelSyncUpdater(null);
}
