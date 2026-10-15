// Relay-synced Assistant lists (to-dos + reminders): one kind 30078 event, d=buzz:assistant-lists, NIP-44 to self.
//
//   { v: 1, items: { <id>: { on, at, item?, firedAt? } }, processed: { <messageId>: at } }
//
// Each item is last-writer-wins by `at` (seconds); ties: removal wins, then the larger JSON (deterministic).
// Removals are tombstones (`on: false`, no item) kept 30 days. `firedAt` (when the desktop fired the reminder's
// wake) merges as max, independent of edits. `processed` (assistant/user message ids already applied to the lists)
// is a grow-only set capped to the newest entries, so two devices never apply the same message twice.
// Pure module: no React, no storage, no relay (tests import it directly).

export const ASSISTANT_LISTS_KIND = 30078;
export const ASSISTANT_LISTS_D_TAG = "buzz:assistant-lists";
export const ASSISTANT_LISTS_TOMBSTONE_SECONDS = 30 * 24 * 3600;
export const ASSISTANT_LISTS_MAX_ITEMS = 2000;
export const ASSISTANT_LISTS_MAX_PROCESSED = 2000;

export type ListKind = "todo" | "reminder";
export type ReminderRepeat =
  | { kind: "daily" }
  | { kind: "weekly"; weekday: number };

/** Same shape as the desktop Assistant's list item. Times are unix seconds. */
export type ListItem = {
  createdAt: number;
  dayKey: string | null;
  dueAt: number | null;
  id: string;
  kind: ListKind;
  repeat: ReminderRepeat | null;
  sortOrder: number;
  sourceMessageId: string | null;
  starred: boolean;
  status: "open" | "done";
  text: string;
  updatedAt: number;
  /** d-tag of the dual-written NIP-ER kind 30300 reminder, when present. */
  nipErD?: string;
};

export type ListEntry = {
  on: boolean;
  at: number;
  item?: ListItem;
  firedAt?: number;
};
export type ListsDoc = {
  v: 1;
  items: Record<string, ListEntry>;
  processed: Record<string, number>;
};

export function emptyListsDoc(): ListsDoc {
  return { v: 1, items: {}, processed: {} };
}

const num = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
/** Seconds from seconds-or-milliseconds. */
export const toSeconds = (v: number) => Math.floor(v > 1e12 ? v / 1000 : v);

function parseRepeat(v: unknown): ReminderRepeat | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (r.kind === "daily") return { kind: "daily" };
  if (r.kind === "weekly" && num(r.weekday))
    return { kind: "weekly", weekday: ((Math.floor(r.weekday) % 7) + 7) % 7 };
  return null;
}

export function parseListItem(v: unknown): ListItem | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    !r.id ||
    (r.kind !== "todo" && r.kind !== "reminder")
  )
    return null;
  if (typeof r.text !== "string" || !num(r.createdAt) || !num(r.updatedAt))
    return null;
  return {
    createdAt: toSeconds(r.createdAt),
    dayKey:
      typeof r.dayKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.dayKey)
        ? r.dayKey
        : null,
    dueAt: r.kind === "reminder" && num(r.dueAt) ? toSeconds(r.dueAt) : null,
    id: r.id,
    kind: r.kind,
    repeat: r.kind === "reminder" ? parseRepeat(r.repeat) : null,
    sortOrder: num(r.sortOrder) ? Math.floor(r.sortOrder) : 0,
    sourceMessageId:
      typeof r.sourceMessageId === "string" ? r.sourceMessageId : null,
    starred: r.starred === true,
    status: r.status === "done" ? "done" : "open",
    text: r.text.slice(0, 4000),
    updatedAt: toSeconds(r.updatedAt),
    ...(typeof r.nipErD === "string" && r.nipErD ? { nipErD: r.nipErD } : {}),
  };
}

function parseEntry(id: string, v: unknown): ListEntry | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (typeof r.on !== "boolean" || !num(r.at)) return null;
  const e: ListEntry = { on: r.on, at: Math.floor(r.at) };
  if (r.on) {
    const item = parseListItem(r.item);
    if (!item || item.id !== id) return null;
    e.item = item;
  }
  if (num(r.firedAt)) e.firedAt = Math.floor(r.firedAt);
  return e;
}

/** Tolerant parse: unknown fields dropped, malformed entries skipped. */
export function parseListsDoc(json: unknown): ListsDoc | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  if (j.v !== 1 || !j.items || typeof j.items !== "object") return null;
  const doc = emptyListsDoc();
  for (const [id, raw] of Object.entries(j.items as Record<string, unknown>)) {
    const e = parseEntry(id, raw);
    if (e) doc.items[id] = e;
  }
  if (j.processed && typeof j.processed === "object") {
    for (const [id, at] of Object.entries(
      j.processed as Record<string, unknown>,
    )) {
      if (id && num(at)) doc.processed[id] = Math.floor(at);
    }
  }
  return doc;
}

function wins(a: ListEntry, b: ListEntry): boolean {
  if (a.at !== b.at) return a.at > b.at;
  if (a.on !== b.on) return !a.on;
  return JSON.stringify(a.item ?? null) > JSON.stringify(b.item ?? null);
}

/** Commutative, associative, idempotent. */
export function mergeListsDoc(a: ListsDoc, b: ListsDoc): ListsDoc {
  const out = emptyListsDoc();
  for (const src of [a.items, b.items]) {
    for (const [id, e] of Object.entries(src)) {
      const cur = out.items[id];
      if (!cur) {
        out.items[id] = { ...e };
        continue;
      }
      const firedAt = Math.max(cur.firedAt ?? 0, e.firedAt ?? 0) || undefined;
      const winner = wins(e, cur) ? e : cur;
      out.items[id] = {
        on: winner.on,
        at: winner.at,
        ...(winner.item ? { item: winner.item } : {}),
        ...(firedAt ? { firedAt } : {}),
      };
    }
  }
  for (const src of [a.processed, b.processed]) {
    for (const [id, at] of Object.entries(src)) {
      out.processed[id] = Math.max(out.processed[id] ?? 0, at);
    }
  }
  return out;
}

export function pruneListsDoc(doc: ListsDoc, nowSeconds: number): ListsDoc {
  const out = emptyListsDoc();
  const cutoff = nowSeconds - ASSISTANT_LISTS_TOMBSTONE_SECONDS;
  const entries = Object.entries(doc.items).filter(
    ([, e]) => e.on || e.at >= cutoff,
  );
  const live = entries
    .filter(([, e]) => e.on)
    .sort((x, y) => y[1].at - x[1].at)
    .slice(0, ASSISTANT_LISTS_MAX_ITEMS);
  for (const [id, e] of [...entries.filter(([, e]) => !e.on), ...live])
    out.items[id] = e;
  const processed = Object.entries(doc.processed)
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
    .slice(0, ASSISTANT_LISTS_MAX_PROCESSED);
  for (const [id, at] of processed) out.processed[id] = at;
  return out;
}

function canonical(doc: ListsDoc): string {
  const sortObj = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  return JSON.stringify({
    items: sortObj(doc.items),
    processed: sortObj(doc.processed),
  });
}

export function sameListsDoc(a: ListsDoc, b: ListsDoc): boolean {
  return canonical(a) === canonical(b);
}

/** Live items, newest-first is not implied; callers sort. */
export function liveItems(doc: ListsDoc): ListItem[] {
  return Object.values(doc.items).flatMap((e) =>
    e.on && e.item ? [e.item] : [],
  );
}

export function firedAtOf(doc: ListsDoc, id: string): number | undefined {
  return doc.items[id]?.firedAt;
}

/** Processed message ids, newest first. */
export function processedIds(doc: ListsDoc): string[] {
  return Object.entries(doc.processed)
    .sort((x, y) => y[1] - x[1])
    .map(([id]) => id);
}

/** Write one item (or remove it) at `at`. */
export function setListItem(
  doc: ListsDoc,
  id: string,
  item: ListItem | null,
  at: number,
): ListsDoc {
  const prev = doc.items[id];
  const next: ListEntry = item ? { on: true, at, item } : { on: false, at };
  if (prev?.firedAt) next.firedAt = prev.firedAt;
  return { ...doc, items: { ...doc.items, [id]: next } };
}

export function markFired(
  doc: ListsDoc,
  ids: readonly string[],
  firedAt: number,
): ListsDoc {
  const items = { ...doc.items };
  for (const id of ids) {
    const e = items[id];
    if (e) items[id] = { ...e, firedAt: Math.max(e.firedAt ?? 0, firedAt) };
  }
  return { ...doc, items };
}

export function markProcessed(
  doc: ListsDoc,
  messageIds: readonly string[],
  at: number,
): ListsDoc {
  const processed = { ...doc.processed };
  for (const id of messageIds) if (id && !(id in processed)) processed[id] = at;
  return { ...doc, processed };
}

/**
 * Fold a full local item list into the doc as edits at `at`: changed/new items are written, items missing from
 * `nextItems` but present in `prevItems` are tombstoned (deleted locally). Unchanged items are untouched, so
 * concurrent edits to other items on other devices survive.
 */
export function applyLocalItems(
  doc: ListsDoc,
  prevItems: readonly ListItem[],
  nextItems: readonly ListItem[],
  at: number,
): ListsDoc {
  let out = doc;
  const nextById = new Map(nextItems.map((i) => [i.id, i]));
  for (const item of nextItems) {
    const cur = out.items[item.id];
    const norm = parseListItem(item);
    if (!norm) continue;
    if (
      cur?.on &&
      cur.item &&
      JSON.stringify(cur.item) === JSON.stringify(norm)
    )
      continue;
    out = setListItem(out, item.id, norm, at);
  }
  for (const item of prevItems) {
    if (!nextById.has(item.id) && out.items[item.id]?.on)
      out = setListItem(out, item.id, null, at);
  }
  return out;
}

/**
 * One-time migration of a device-local list state (desktop localStorage) into the doc. Each item is written at its
 * own `updatedAt`, so a newer edit already on the relay (from another device) still wins.
 */
export function migrateLocalLists(
  doc: ListsDoc,
  local:
    | { items?: readonly unknown[]; processedMessageIds?: readonly unknown[] }
    | null
    | undefined,
  nowSeconds: number,
): ListsDoc {
  if (!local) return doc;
  const add = emptyListsDoc();
  for (const raw of local.items ?? []) {
    const item = parseListItem(raw);
    if (item)
      add.items[item.id] = {
        on: true,
        at: Math.min(item.updatedAt, nowSeconds),
        item,
      };
  }
  const ids = (local.processedMessageIds ?? []).filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  // Older ids first so the newest keep the highest stamps.
  ids.forEach((id, i) => {
    add.processed[id] = Math.max(1, nowSeconds - ids.length + i);
  });
  return mergeListsDoc(doc, add);
}

/** Open reminders whose time has come and that the desktop has not fired for this due time yet. */
export function dueUnfiredReminders(
  doc: ListsDoc,
  nowSeconds: number,
): ListItem[] {
  return Object.values(doc.items).flatMap((e) =>
    e.on &&
    e.item &&
    e.item.kind === "reminder" &&
    e.item.status === "open" &&
    e.item.dueAt != null &&
    e.item.dueAt <= nowSeconds &&
    !((e.firedAt ?? 0) >= e.item.dueAt)
      ? [e.item]
      : [],
  );
}

/** Open reminders due now (fired or not): what the Reminders badge counts. */
export function dueReminderItems(
  doc: ListsDoc,
  nowSeconds: number,
): ListItem[] {
  return liveItems(doc).filter(
    (i) =>
      i.kind === "reminder" &&
      i.status === "open" &&
      i.dueAt != null &&
      i.dueAt <= nowSeconds,
  );
}

/** Next due time of a repeating reminder strictly after `nowSeconds` (deterministic on every device). */
export function nextRepeatDueAt(
  item: ListItem,
  nowSeconds: number,
): number | null {
  if (!item.repeat || item.dueAt == null) return null;
  const step = item.repeat.kind === "daily" ? 86400 : 7 * 86400;
  if (item.dueAt > nowSeconds) return item.dueAt;
  const n = Math.floor((nowSeconds - item.dueAt) / step) + 1;
  return item.dueAt + n * step;
}
