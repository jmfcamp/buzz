// Relay sync for the Assistant lists doc (listsDoc.ts): kind 30078, d=buzz:assistant-lists, NIP-44 to self, on the
// generic synced-doc engine. The relay doc is the source of truth; listsStore.ts is the in-memory view everyone reads.
import { SyncedDoc, type SyncedDocCodec } from "@/shared/lib/syncedDoc";

import {
  ASSISTANT_LISTS_D_TAG,
  ASSISTANT_LISTS_KIND,
  emptyListsDoc,
  type ListsDoc,
  mergeListsDoc,
  parseListsDoc,
  pruneListsDoc,
  sameListsDoc,
} from "./listsDoc";
import {
  emitAssistantListsChanged,
  isActiveListsEngine,
  setActiveListsEngine,
} from "./listsStore";

export * from "./listsStore";

const CACHE_PREFIX = "buzz-assistant-lists.v1";
export const ASSISTANT_LISTS_PUBLISH_DEBOUNCE_MS = 3_000;

const codec: SyncedDocCodec<ListsDoc> = {
  empty: emptyListsDoc,
  parse: parseListsDoc,
  merge: mergeListsDoc,
  prune: pruneListsDoc,
  same: sameListsDoc,
};

/** Start (or restart on community/identity switch) the sync for `pubkey` on the community relay. */
export function startAssistantListsSync(
  pubkey: string,
  relayUrl: string,
): () => void {
  const pk = pubkey.trim().toLowerCase();
  const sync = new SyncedDoc<ListsDoc>({
    pk,
    kind: ASSISTANT_LISTS_KIND,
    dTag: ASSISTANT_LISTS_D_TAG,
    codec,
    cacheKey: `${CACHE_PREFIX}:${relayUrl.trim().toLowerCase()}:${pk}`,
    debounceMs: ASSISTANT_LISTS_PUBLISH_DEBOUNCE_MS,
    label: "Assistant lists",
    onRemoteChange: emitAssistantListsChanged,
  });
  setActiveListsEngine(sync, relayUrl);
  void sync.start();
  const onHide = () => {
    if (document.visibilityState === "hidden") sync.flush();
  };
  document.addEventListener("visibilitychange", onHide);
  return () => {
    document.removeEventListener("visibilitychange", onHide);
    sync.stop();
    if (isActiveListsEngine(sync)) setActiveListsEngine(null);
  };
}
