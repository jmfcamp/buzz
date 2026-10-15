// Relay sync for the per-user Inbox state document (see inboxStateDoc.ts).
//
// The doc is the source of truth. The older per-device stores (done/unread,
// thread follows, stars, muted roots) stay as a working cache that existing
// hooks read: on every remote change this module projects the merged doc into
// them and tells the hooks to reload. Hooks report user actions through
// `recordInboxState`, so the cache is never the thing that syncs.
import {
  nowSec,
  readJson,
  SyncedDoc,
  type SyncedDocCodec,
  writeJson,
} from "@/shared/lib/syncedDoc";
import {
  activeIds,
  emptyInboxState,
  INBOX_STATE_D_TAG,
  INBOX_STATE_KIND,
  type InboxStateDoc,
  type InboxStateLane,
  mergeInboxState,
  parseInboxState,
  pruneInboxState,
  sameInboxState,
  setInboxStateEntry,
  type StarMeta,
  unionLegacyInboxState,
} from "./inboxStateDoc";

const CACHE_PREFIX = "buzz-inbox-state.v1";
const MIGRATED_PREFIX = "buzz-inbox-state-migrated.v1";
/** One publish per burst of actions. Matches the read-marker window. */
export const INBOX_STATE_PUBLISH_DEBOUNCE_MS = 8_000;
/** Fired on window after the cache stores were rewritten from the doc. */
export const INBOX_STATE_APPLIED_EVENT = "buzz-inbox-state-applied";

// Legacy cache keys (must match their owners).
const legacy = {
  done: (pk: string) => `buzz-home-feed-done.v1:${pk}`,
  unread: (pk: string) => `buzz-home-feed-unread.v1:${pk}`,
  muted: (pk: string) => `buzz-thread-muted.v1:${pk}`,
  followed: (pk: string) => `buzz-thread-follows.v1:${pk}`,
  starred: (pk: string) => `buzz-thread-stars.v1:${pk}`,
};

import {
  type ChannelNotifyMode,
  channelNotifyFromDoc,
  channelNotifyId,
  channelNotifyLaneValues,
  isChannelNotifyId,
  readChannelNotifyCache,
  writeChannelNotifyCache,
} from "./channelNotify";
import {
  mutedChannelIdsFromStore,
  readChannelMutesStore,
} from "@/features/sidebar/lib/channelMutesStorage";


function stringArray(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

/** Read this device's legacy stores (used once, for the union migration). */
export function readLegacyInboxState(pk: string) {
  const follows = readJson(legacy.followed(pk));
  const stars = readJson(legacy.starred(pk)) as {
    threads?: Record<string, any>;
  } | null;
  return {
    done: stringArray(readJson(legacy.done(pk))),
    unread: stringArray(readJson(legacy.unread(pk))),
    muted: stringArray(readJson(legacy.muted(pk))),
    followed: Array.isArray(follows)
      ? follows.flatMap((e: any) =>
          typeof e?.rootId === "string" ? [e.rootId] : [],
        )
      : [],
    starred: Object.values(stars?.threads ?? {}).flatMap((e: any) =>
      typeof e?.rootId === "string" && typeof e?.channelId === "string"
        ? [
            {
              rootId: e.rootId,
              meta: {
                channelId: e.channelId,
                title: String(e.title ?? "Thread"),
                channelName: String(e.channelName ?? "channel"),
              },
            },
          ]
        : [],
    ),
  };
}

/** Rewrite the legacy cache stores from the doc, then notify hooks. */
export function projectInboxStateToLegacy(pk: string, doc: InboxStateDoc) {
  // `ch:` (channel notify) and `as:` (assistant pick) ids live in lanes but are not threads.
  const isThreadId = (id: string) => !isChannelNotifyId(id) && !id.startsWith("as:");
  writeJson(legacy.done(pk), activeIds(doc, "done"));
  writeJson(legacy.unread(pk), activeIds(doc, "unread"));
  writeJson(legacy.muted(pk), activeIds(doc, "muted").filter(isThreadId));
  writeChannelNotifyCache(pk, channelNotifyFromDoc(doc));
  writeJson(
    legacy.followed(pk),
    activeIds(doc, "followed").filter(isThreadId).map((rootId) => ({
      rootId,
      followedAt: doc.lanes.followed[rootId].at * 1000,
    })),
  );
  const threads: Record<string, unknown> = {};
  for (const rootId of activeIds(doc, "starred")) {
    const e = doc.lanes.starred[rootId];
    if (!e.meta) continue;
    threads[rootId] = { rootId, ...e.meta, starredAt: e.at };
  }
  writeJson(legacy.starred(pk), { version: 1, threads });
  if (typeof window === "undefined") return;
  // Same-window StorageEvents wake hooks that already listen for cross-tab edits.
  for (const key of [legacy.followed(pk), legacy.starred(pk)]) {
    try {
      window.dispatchEvent(new StorageEvent("storage", { key }));
    } catch {
      /* old engines */
    }
  }
  window.dispatchEvent(
    new CustomEvent(INBOX_STATE_APPLIED_EVENT, { detail: { pubkey: pk } }),
  );
}

const inboxStateCodec: SyncedDocCodec<InboxStateDoc> = {
  empty: emptyInboxState,
  parse: parseInboxState,
  merge: mergeInboxState,
  prune: pruneInboxState,
  same: sameInboxState,
};

/** Inbox-state doc on the generic synced-doc engine (shared/lib/syncedDoc.ts) plus legacy-cache projection. */
class InboxStateSync {
  private engine: SyncedDoc<InboxStateDoc>;

  get doc(): InboxStateDoc {
    return this.engine.doc;
  }

  constructor(readonly pk: string) {
    this.engine = new SyncedDoc<InboxStateDoc>({
      pk,
      kind: INBOX_STATE_KIND,
      dTag: INBOX_STATE_D_TAG,
      codec: inboxStateCodec,
      cacheKey: `${CACHE_PREFIX}:${pk}`,
      debounceMs: INBOX_STATE_PUBLISH_DEBOUNCE_MS,
      label: "Inbox state",
      onRemoteChange: (doc) => projectInboxStateToLegacy(pk, doc),
      onBootstrapNoRemote: (doc) => projectInboxStateToLegacy(pk, doc),
    });
    // One-way: channel mutes (kind channel-mutes) become `ch:` entries in the
    // muted lane at at=1, so any real choice from another device wins.
    if (!readJson(`buzz-channel-notify-migrated.v1:${pk}`)) {
      const add = emptyInboxState();
      for (const id of mutedChannelIdsFromStore(readChannelMutesStore(pk))) {
        add.lanes.muted[channelNotifyId(id)] = { on: true, at: 1 };
      }
      this.engine.doc = mergeInboxState(this.engine.doc, add);
      writeJson(`buzz-channel-notify-migrated.v1:${pk}`, nowSec());
      this.engine.persist();
    }
    if (!readJson(`${MIGRATED_PREFIX}:${pk}`)) {
      this.engine.doc = unionLegacyInboxState(this.engine.doc, readLegacyInboxState(pk));
      writeJson(`${MIGRATED_PREFIX}:${pk}`, nowSec());
      this.engine.persist();
    }
  }

  start() {
    return this.engine.start();
  }

  record(lane: InboxStateLane, id: string, on: boolean, meta?: StarMeta) {
    if (!id) return;
    const cur = this.doc.lanes[lane][id];
    if (cur && cur.on === on && (!on || !meta || cur.meta)) return;
    this.engine.update(setInboxStateEntry(this.doc, lane, id, on, nowSec(), meta));
  }

  flush() {
    this.engine.flush();
  }

  stop() {
    this.engine.stop();
  }
}

let active: InboxStateSync | null = null;

/** Start (or restart, e.g. on community/identity switch) the sync for `pubkey`. */
export function startInboxStateSync(pubkey: string): () => void {
  const pk = pubkey.trim().toLowerCase();
  active?.stop();
  const sync = new InboxStateSync(pk);
  active = sync;
  void sync.start();
  const onHide = () => {
    if (document.visibilityState === "hidden") sync.flush();
  };
  document.addEventListener("visibilitychange", onHide);
  return () => {
    document.removeEventListener("visibilitychange", onHide);
    sync.stop();
    if (active === sync) active = null;
  };
}

/** Report a user action. No-op until a sync is running for that pubkey. */
/** Apply a local action immediately to the projected caches too (channel notify). */
export function currentInboxStateDoc(pubkey: string | undefined) {
  const pk = pubkey?.trim().toLowerCase();
  return pk && active && active.pk === pk ? active.doc : null;
}

export function recordInboxState(
  pubkey: string | undefined,
  lane: InboxStateLane,
  id: string,
  on: boolean,
  meta?: StarMeta,
) {
  const pk = pubkey?.trim().toLowerCase();
  if (!pk || !active || active.pk !== pk) return;
  active.record(lane, id, on, meta);
}

/**
 * Set a channel's notification level (All messages / Mentions only / Mute).
 * Writes both `ch:` lane entries and updates the projected cache right away.
 */
export function setChannelNotifyMode(
  pubkey: string | undefined,
  channelId: string,
  mode: ChannelNotifyMode,
) {
  const pk = pubkey?.trim().toLowerCase();
  if (!pk || !channelId) return;
  const values = channelNotifyLaneValues(mode);
  const id = channelNotifyId(channelId);
  recordInboxState(pk, "followed", id, values.followed);
  recordInboxState(pk, "muted", id, values.muted);
  const doc = currentInboxStateDoc(pk);
  if (doc) {
    writeChannelNotifyCache(pk, channelNotifyFromDoc(doc));
  } else {
    const cur = readChannelNotifyCache(pk);
    const all = new Set(cur.all);
    const muted = new Set(cur.muted);
    all.delete(channelId);
    muted.delete(channelId);
    if (mode === "all") all.add(channelId);
    if (mode === "mute") muted.add(channelId);
    writeChannelNotifyCache(pk, { all, muted });
  }
}
