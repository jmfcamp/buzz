// Simple list edits for the open web UI (the desktop Assistant has richer ops in its protected store).
import {
  type ListItem,
  type ListKind,
  type ListsDoc,
  nextRepeatDueAt,
  setListItem,
} from "./listsDoc";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function localDayKey(seconds: number) {
  const d = new Date(seconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addItem(
  doc: ListsDoc,
  now: number,
  input: {
    kind: ListKind;
    text: string;
    dueAt?: number | null;
    repeat?: ListItem["repeat"];
  },
): ListsDoc {
  const text = input.text.trim();
  if (!text) return doc;
  const minOrder = Object.values(doc.items).reduce(
    (m, e) => (e.on && e.item ? Math.min(m, e.item.sortOrder) : m),
    now,
  );
  const item: ListItem = {
    createdAt: now,
    dayKey: input.kind === "todo" ? localDayKey(now) : null,
    dueAt: input.kind === "reminder" ? (input.dueAt ?? null) : null,
    id: newId(),
    kind: input.kind,
    repeat: input.kind === "reminder" ? (input.repeat ?? null) : null,
    sortOrder: minOrder - 1,
    sourceMessageId: null,
    starred: false,
    status: "open",
    text: text.slice(0, 4000),
    updatedAt: now,
  };
  return setListItem(doc, item.id, item, now);
}

function edit(
  doc: ListsDoc,
  id: string,
  now: number,
  fn: (i: ListItem) => ListItem | null,
): ListsDoc {
  const cur = doc.items[id];
  if (!cur?.on || !cur.item) return doc;
  const next = fn(cur.item);
  return setListItem(doc, id, next ? { ...next, updatedAt: now } : null, now);
}

/** Check / uncheck. A repeating reminder that is checked rolls to its next due time instead of closing. */
export function setStatus(
  doc: ListsDoc,
  id: string,
  done: boolean,
  now: number,
): ListsDoc {
  return edit(doc, id, now, (i) => {
    if (done && i.kind === "reminder" && i.repeat) {
      const next = nextRepeatDueAt(i, now);
      if (next != null) return { ...i, dueAt: next, status: "open" };
    }
    return { ...i, status: done ? "done" : "open" };
  });
}

export function snooze(
  doc: ListsDoc,
  id: string,
  seconds: number,
  now: number,
): ListsDoc {
  return edit(doc, id, now, (i) =>
    i.kind === "reminder" ? { ...i, dueAt: now + seconds, status: "open" } : i,
  );
}

export function editItem(
  doc: ListsDoc,
  id: string,
  patch: { text?: string; dueAt?: number | null },
  now: number,
): ListsDoc {
  return edit(doc, id, now, (i) => ({
    ...i,
    ...(patch.text != null && patch.text.trim()
      ? { text: patch.text.trim().slice(0, 4000) }
      : {}),
    ...(i.kind === "reminder" && patch.dueAt !== undefined
      ? { dueAt: patch.dueAt }
      : {}),
  }));
}

export function removeItem(doc: ListsDoc, id: string, now: number): ListsDoc {
  return edit(doc, id, now, () => null);
}

/** Attach or clear the dual-written NIP-ER d-tag on an Assist reminder. */
export function setNipErD(
  doc: ListsDoc,
  id: string,
  nipErD: string | undefined,
  now: number,
): ListsDoc {
  return edit(doc, id, now, (i) => {
    if (i.kind !== "reminder") return i;
    if (nipErD) return { ...i, nipErD };
    const { nipErD: _drop, ...rest } = i;
    return rest;
  });
}
