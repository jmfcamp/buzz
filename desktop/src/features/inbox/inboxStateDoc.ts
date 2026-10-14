// Synced per-user Inbox state: kind 30078, d=buzz:inbox-state, NIP-44 to self.
//
// One document, five id-keyed lanes. Each entry is last-writer-wins by `at`
// (seconds); removals are tombstones (`on: false`) kept for 30 days so a stale
// device cannot resurrect an item it never saw removed. Merging is
// commutative, associative and idempotent, so any device can merge any copy.

export const INBOX_STATE_D_TAG = "buzz:inbox-state";
export const INBOX_STATE_KIND = 30078;
export const INBOX_STATE_TOMBSTONE_SECONDS = 30 * 24 * 3600;
/** Live entries kept per lane (newest by `at`). */
export const INBOX_STATE_MAX_PER_LANE = 1000;

export const INBOX_STATE_LANES = [
  "done",
  "unread",
  "muted",
  "followed",
  "starred",
] as const;
export type InboxStateLane = (typeof INBOX_STATE_LANES)[number];

export type StarMeta = {
  channelId: string;
  title: string;
  channelName: string;
};
export type InboxStateEntry = { on: boolean; at: number; meta?: StarMeta };
export type InboxStateDoc = {
  v: 1;
  lanes: Record<InboxStateLane, Record<string, InboxStateEntry>>;
};

export function emptyInboxState(): InboxStateDoc {
  return {
    v: 1,
    lanes: { done: {}, unread: {}, muted: {}, followed: {}, starred: {} },
  };
}

function wins(a: InboxStateEntry, b: InboxStateEntry): boolean {
  // true when `a` beats `b`. Ties: removal wins (conservative), then meta.
  if (a.at !== b.at) return a.at > b.at;
  if (a.on !== b.on) return !a.on;
  return JSON.stringify(a.meta ?? null) > JSON.stringify(b.meta ?? null);
}

function parseEntry(raw: unknown): InboxStateEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.on !== "boolean" ||
    typeof r.at !== "number" ||
    !Number.isFinite(r.at)
  )
    return null;
  const entry: InboxStateEntry = { on: r.on, at: Math.floor(r.at) };
  const m = r.meta as Record<string, unknown> | undefined;
  if (
    m &&
    typeof m.channelId === "string" &&
    typeof m.title === "string" &&
    typeof m.channelName === "string"
  )
    entry.meta = {
      channelId: m.channelId,
      title: m.title,
      channelName: m.channelName,
    };
  return entry;
}

/** Tolerant parse: unknown lanes/fields dropped, malformed entries skipped. */
export function parseInboxState(json: unknown): InboxStateDoc | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  if (j.v !== 1 || !j.lanes || typeof j.lanes !== "object") return null;
  const doc = emptyInboxState();
  const lanes = j.lanes as Record<string, unknown>;
  for (const lane of INBOX_STATE_LANES) {
    const src = lanes[lane];
    if (!src || typeof src !== "object") continue;
    for (const [id, raw] of Object.entries(src as Record<string, unknown>)) {
      const e = parseEntry(raw);
      if (e && id) doc.lanes[lane][id] = e;
    }
  }
  return doc;
}

export function mergeInboxState(
  a: InboxStateDoc,
  b: InboxStateDoc,
): InboxStateDoc {
  const out = emptyInboxState();
  for (const lane of INBOX_STATE_LANES) {
    const dst = out.lanes[lane];
    for (const src of [a.lanes[lane], b.lanes[lane]]) {
      for (const [id, e] of Object.entries(src)) {
        const cur = dst[id];
        if (!cur || wins(e, cur)) dst[id] = e;
      }
    }
  }
  return out;
}

/** Drop expired tombstones and cap each lane to its newest live entries. */
export function pruneInboxState(
  doc: InboxStateDoc,
  nowSeconds: number,
): InboxStateDoc {
  const out = emptyInboxState();
  const cutoff = nowSeconds - INBOX_STATE_TOMBSTONE_SECONDS;
  for (const lane of INBOX_STATE_LANES) {
    const entries = Object.entries(doc.lanes[lane]).filter(
      ([, e]) => e.on || e.at >= cutoff,
    );
    const live = entries
      .filter(([, e]) => e.on)
      .sort((x, y) => y[1].at - x[1].at);
    const keepLive = new Set(
      live.slice(0, INBOX_STATE_MAX_PER_LANE).map(([id]) => id),
    );
    for (const [id, e] of entries) {
      if (e.on && !keepLive.has(id)) continue;
      out.lanes[lane][id] = e;
    }
  }
  return out;
}

export function setInboxStateEntry(
  doc: InboxStateDoc,
  lane: InboxStateLane,
  id: string,
  on: boolean,
  at: number,
  meta?: StarMeta,
): InboxStateDoc {
  const prev = doc.lanes[lane][id];
  // A local action always moves forward past whatever we last saw.
  const stamp = prev && prev.at >= at ? prev.at + 1 : at;
  const entry: InboxStateEntry = meta
    ? { on, at: stamp, meta }
    : { on, at: stamp };
  return {
    ...doc,
    lanes: { ...doc.lanes, [lane]: { ...doc.lanes[lane], [id]: entry } },
  };
}

export function activeIds(doc: InboxStateDoc, lane: InboxStateLane): string[] {
  return Object.entries(doc.lanes[lane])
    .filter(([, e]) => e.on)
    .sort((x, y) => x[1].at - y[1].at)
    .map(([id]) => id);
}

export type LegacyInboxState = {
  done?: Iterable<string>;
  unread?: Iterable<string>;
  muted?: Iterable<string>;
  followed?: Iterable<string>;
  starred?: Iterable<{ rootId: string; meta?: StarMeta }>;
};

/**
 * First-run migration: union this device's legacy stores into the doc. Every
 * migrated id is stamped `at = 1` so any real remote decision (including a
 * removal made on another device) beats it, while it still survives a merge
 * against a remote that never saw the id.
 */
export function unionLegacyInboxState(
  doc: InboxStateDoc,
  legacy: LegacyInboxState,
): InboxStateDoc {
  const add = emptyInboxState();
  const put = (lane: InboxStateLane, id: string, meta?: StarMeta) => {
    if (id)
      add.lanes[lane][id] = meta
        ? { on: true, at: 1, meta }
        : { on: true, at: 1 };
  };
  for (const id of legacy.done ?? []) put("done", id);
  for (const id of legacy.unread ?? []) put("unread", id);
  for (const id of legacy.muted ?? []) put("muted", id);
  for (const id of legacy.followed ?? []) put("followed", id);
  for (const s of legacy.starred ?? []) put("starred", s.rootId, s.meta);
  return mergeInboxState(doc, add);
}

export function sameInboxState(a: InboxStateDoc, b: InboxStateDoc): boolean {
  for (const lane of INBOX_STATE_LANES) {
    const ka = Object.keys(a.lanes[lane]);
    if (ka.length !== Object.keys(b.lanes[lane]).length) return false;
    for (const id of ka) {
      const x = a.lanes[lane][id];
      const y = b.lanes[lane][id];
      if (!y || x.on !== y.on || x.at !== y.at) return false;
    }
  }
  return true;
}
