// Relay sync for the per-user Inbox state document (see inboxStateDoc.ts).
//
// The doc is the source of truth. The older per-device stores (done/unread,
// thread follows, stars, muted roots) stay as a working cache that existing
// hooks read: on every remote change this module projects the merged doc into
// them and tells the hooks to reload. Hooks report user actions through
// `recordInboxState`, so the cache is never the thing that syncs.
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import type { RelayEvent } from "@/shared/api/types";
import { decryptAppData, encryptAppData } from "@/shared/lib/appData";
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

const nowSec = () => Math.floor(Date.now() / 1000);

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode: doc still syncs from memory */
  }
}

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
  const isThreadId = (id: string) => !isChannelNotifyId(id);
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

class InboxStateSync {
  doc: InboxStateDoc;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPublished: InboxStateDoc | null = null;
  private lastCreatedAt = 0;
  private stopLive: (() => Promise<void>) | null = null;
  private stopped = false;

  constructor(readonly pk: string) {
    this.doc =
      parseInboxState(readJson(`${CACHE_PREFIX}:${pk}`)) ?? emptyInboxState();
    // One-way: channel mutes (kind channel-mutes) become `ch:` entries in the
    // muted lane at at=1, so any real choice from another device wins.
    if (!readJson(`buzz-channel-notify-migrated.v1:${pk}`)) {
      const add = emptyInboxState();
      for (const id of mutedChannelIdsFromStore(readChannelMutesStore(pk))) {
        add.lanes.muted[channelNotifyId(id)] = { on: true, at: 1 };
      }
      this.doc = mergeInboxState(this.doc, add);
      writeJson(`buzz-channel-notify-migrated.v1:${pk}`, nowSec());
      this.persist();
    }
    if (!readJson(`${MIGRATED_PREFIX}:${pk}`)) {
      this.doc = unionLegacyInboxState(this.doc, readLegacyInboxState(pk));
      writeJson(`${MIGRATED_PREFIX}:${pk}`, nowSec());
      this.persist();
    }
  }

  private persist() {
    writeJson(`${CACHE_PREFIX}:${this.pk}`, this.doc);
  }

  private async decode(ev: RelayEvent): Promise<InboxStateDoc | null> {
    if (ev.pubkey !== this.pk) return null;
    if (ev.created_at > this.lastCreatedAt) this.lastCreatedAt = ev.created_at;
    try {
      return parseInboxState(JSON.parse(await decryptAppData(ev.content)));
    } catch {
      return null;
    }
  }

  private absorb(remote: InboxStateDoc) {
    const merged = pruneInboxState(mergeInboxState(this.doc, remote), nowSec());
    const changed = !sameInboxState(merged, this.doc);
    this.doc = merged;
    if (changed) {
      this.persist();
      projectInboxStateToLegacy(this.pk, this.doc);
    }
    // Remote lacks something we have (e.g. migrated ids): push the union back.
    if (!sameInboxState(merged, remote)) this.schedule();
    else this.lastPublished = merged;
  }

  async start() {
    try {
      const events = await relayClient.fetchEvents({
        kinds: [INBOX_STATE_KIND],
        authors: [this.pk],
        "#d": [INBOX_STATE_D_TAG],
        limit: 1,
      });
      const ev = events.find((e) => e.pubkey === this.pk);
      const remote = ev ? await this.decode(ev) : null;
      if (this.stopped) return;
      if (remote) this.absorb(remote);
      else {
        projectInboxStateToLegacy(this.pk, this.doc);
        // An undecryptable head must not be overwritten blindly.
        if (!ev) this.schedule();
      }
    } catch (error) {
      console.warn("[inboxState] bootstrap failed:", error);
    }
    if (this.stopped) return;
    try {
      const stop = await relayClient.subscribeLive(
        {
          kinds: [INBOX_STATE_KIND],
          authors: [this.pk],
          "#d": [INBOX_STATE_D_TAG],
          limit: 0,
        },
        (ev) => {
          void this.decode(ev).then((remote) => {
            if (remote && !this.stopped) this.absorb(remote);
          });
        },
      );
      if (this.stopped) void stop();
      else this.stopLive = stop;
    } catch (error) {
      console.warn("[inboxState] live subscribe failed:", error);
    }
  }

  record(lane: InboxStateLane, id: string, on: boolean, meta?: StarMeta) {
    if (!id) return;
    const cur = this.doc.lanes[lane][id];
    if (cur && cur.on === on && (!on || !meta || cur.meta)) return;
    this.doc = setInboxStateEntry(this.doc, lane, id, on, nowSec(), meta);
    this.persist();
    this.schedule();
  }

  private schedule() {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.publish();
    }, INBOX_STATE_PUBLISH_DEBOUNCE_MS);
  }

  flush() {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    void this.publish();
  }

  private async publish() {
    if (this.stopped) return;
    const doc = pruneInboxState(this.doc, nowSec());
    if (this.lastPublished && sameInboxState(doc, this.lastPublished)) return;
    try {
      const content = await encryptAppData(JSON.stringify(doc));
      const event = await signRelayEvent({
        kind: INBOX_STATE_KIND,
        content,
        createdAt: Math.max(nowSec(), this.lastCreatedAt + 1),
        tags: [["d", INBOX_STATE_D_TAG]],
      });
      if (this.stopped) return;
      await relayClient.publishEvent(
        event,
        "Timed out publishing Inbox state.",
        "Failed to publish Inbox state.",
      );
      this.lastCreatedAt = event.created_at;
      this.lastPublished = doc;
    } catch (error) {
      console.warn("[inboxState] publish failed:", error);
    }
  }

  stop() {
    this.flush();
    this.stopped = true;
    void this.stopLive?.();
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
