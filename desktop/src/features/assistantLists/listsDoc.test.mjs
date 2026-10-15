import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLocalItems,
  dueReminderItems,
  dueUnfiredReminders,
  emptyListsDoc,
  liveItems,
  markFired,
  markProcessed,
  mergeListsDoc,
  migrateLocalLists,
  nextRepeatDueAt,
  parseListsDoc,
  pruneListsDoc,
  sameListsDoc,
  setListItem,
} from "./listsDoc.ts";
import { addItem, removeItem, setStatus, snooze } from "./listsOps.ts";

const item = (id, over = {}) => ({
  createdAt: 100,
  dayKey: null,
  dueAt: null,
  id,
  kind: "todo",
  repeat: null,
  sortOrder: 0,
  sourceMessageId: null,
  starred: false,
  status: "open",
  text: `t-${id}`,
  updatedAt: 100,
  ...over,
});

test("merge is commutative, associative and idempotent", () => {
  const a = setListItem(emptyListsDoc(), "x", item("x", { text: "a" }), 10);
  const b = setListItem(emptyListsDoc(), "x", item("x", { text: "b" }), 20);
  const c = markProcessed(
    setListItem(emptyListsDoc(), "y", null, 15),
    ["m1"],
    5,
  );
  const ab = mergeListsDoc(a, b);
  assert.ok(sameListsDoc(ab, mergeListsDoc(b, a)));
  assert.ok(
    sameListsDoc(mergeListsDoc(ab, c), mergeListsDoc(a, mergeListsDoc(b, c))),
  );
  assert.ok(sameListsDoc(mergeListsDoc(ab, ab), ab));
  assert.equal(liveItems(ab)[0].text, "b");
});

test("tie: removal wins; newer edit beats older tombstone", () => {
  const edit = setListItem(emptyListsDoc(), "x", item("x"), 10);
  const del = setListItem(emptyListsDoc(), "x", null, 10);
  assert.equal(liveItems(mergeListsDoc(edit, del)).length, 0);
  const later = setListItem(emptyListsDoc(), "x", item("x"), 11);
  assert.equal(liveItems(mergeListsDoc(del, later)).length, 1);
});

test("firedAt merges as max independent of edits", () => {
  const r = item("r", { kind: "reminder", dueAt: 50 });
  const fired = markFired(setListItem(emptyListsDoc(), "r", r, 10), ["r"], 60);
  const edited = setListItem(emptyListsDoc(), "r", { ...r, text: "new" }, 20);
  const m = mergeListsDoc(fired, edited);
  assert.equal(m.items.r.firedAt, 60);
  assert.equal(m.items.r.item.text, "new");
  assert.equal(dueUnfiredReminders(m, 100).length, 0);
  assert.equal(dueReminderItems(m, 100).length, 1);
  // Snoozed past the fire time: due again later, unfired.
  const snoozed = snooze(m, "r", 3600, 100);
  assert.equal(dueUnfiredReminders(snoozed, 100 + 3600).length, 1);
});

test("local fold writes only changed items and tombstones deletions", () => {
  const base = setListItem(
    setListItem(emptyListsDoc(), "a", item("a"), 5),
    "b",
    item("b"),
    5,
  );
  const next = applyLocalItems(
    base,
    [item("a"), item("b")],
    [item("a", { text: "A2", updatedAt: 9 })],
    9,
  );
  assert.equal(next.items.a.at, 9);
  assert.equal(next.items.b.on, false);
  // Concurrent remote edit to an untouched item survives.
  const remote = setListItem(base, "c", item("c"), 7);
  assert.equal(liveItems(mergeListsDoc(next, remote)).length, 2);
});

test("migration uses item updatedAt so newer relay edits win; processed ids carried", () => {
  const relay = setListItem(
    emptyListsDoc(),
    "a",
    item("a", { text: "relay", updatedAt: 500 }),
    500,
  );
  const local = {
    items: [
      item("a", { text: "local", updatedAt: 300 }),
      item("b", { updatedAt: 1_700_000_000_000 }),
    ],
    processedMessageIds: ["m1", "m2"],
  };
  const m = migrateLocalLists(relay, local, 2_000_000_000);
  assert.equal(m.items.a.item.text, "relay");
  assert.equal(m.items.b.item.updatedAt, 1_700_000_000);
  assert.deepEqual(Object.keys(m.processed).sort(), ["m1", "m2"]);
  assert.ok(sameListsDoc(migrateLocalLists(m, local, 2_000_000_000), m));
  assert.equal(migrateLocalLists(relay, null, 1), relay);
});

test("parse is tolerant; prune drops old tombstones and caps processed", () => {
  const doc = parseListsDoc({
    v: 1,
    items: {
      a: { on: true, at: 1, item: item("a") },
      bad: { on: true, at: 1, item: { id: "zz" } },
      old: { on: false, at: 1 },
    },
    processed: { m: 3, n: "x" },
  });
  assert.deepEqual(Object.keys(doc.items).sort(), ["a", "old"]);
  assert.deepEqual(Object.keys(doc.processed), ["m"]);
  const pruned = pruneListsDoc(doc, 100 * 24 * 3600);
  assert.deepEqual(Object.keys(pruned.items), ["a"]);
  assert.equal(parseListsDoc({ v: 2, items: {} }), null);
});

test("web ops: add, check repeating reminder rolls forward, remove", () => {
  let d = addItem(emptyListsDoc(), 1000, {
    kind: "reminder",
    text: " call ",
    dueAt: 900,
  });
  const id = liveItems(d)[0].id;
  d = setListItem(
    d,
    id,
    { ...d.items[id].item, repeat: { kind: "daily" } },
    1000,
  );
  d = setStatus(d, id, true, 2000);
  assert.equal(d.items[id].item.status, "open");
  assert.equal(d.items[id].item.dueAt, 900 + 86400);
  assert.equal(nextRepeatDueAt(d.items[id].item, 100), 900 + 86400);
  d = removeItem(d, id, 3000);
  assert.equal(liveItems(d).length, 0);
});
