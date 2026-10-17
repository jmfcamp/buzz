import assert from "node:assert/strict";
import test from "node:test";

import {
  countDueInboxReminders,
  groupReminders,
  inboxMessageReminders,
  isAssistListCopy,
  isDue,
} from "../reminders/lib/reminderFilters.ts";
import {
  assistantListsBadgeCount,
  dueReminderItems,
  emptyListsDoc,
  openAssistantReminderCount,
  setListItem,
} from "./listsDoc.ts";

const NOW = 10_000;

const item = (id, over = {}) => ({
  createdAt: 100,
  dayKey: null,
  dueAt: null,
  id,
  kind: "reminder",
  repeat: null,
  sortOrder: 0,
  sourceMessageId: null,
  starred: false,
  status: "open",
  text: `t-${id}`,
  updatedAt: 100,
  ...over,
});

function docOf(items, removed = []) {
  let doc = emptyListsDoc();
  let at = 1;
  for (const i of items) doc = setListItem(doc, i.id, i, at++);
  for (const id of removed) doc = setListItem(doc, id, null, at++);
  return doc;
}

const reminder = ({ id, notBefore, status = "pending", source }) => ({
  id,
  eventId: `${id}-evt`,
  notBefore,
  createdAt: 0,
  content: source ? { status, source } : { status },
});

test("assistant badge: no doc counts 0", () => {
  assert.equal(assistantListsBadgeCount(null, NOW), 0);
  assert.equal(assistantListsBadgeCount(undefined, NOW), 0);
  assert.equal(openAssistantReminderCount(null), 0);
});

test("assistant badge counts only open, due, live reminders", () => {
  const doc = docOf(
    [
      item("due", { dueAt: NOW - 60 }),
      item("due-now", { dueAt: NOW }),
      item("future", { dueAt: NOW + 60 }),
      item("done", { dueAt: NOW - 60, status: "done" }),
      item("no-due", {}),
      item("todo", { dueAt: NOW - 60, kind: "todo" }),
      item("deleted", { dueAt: NOW - 60 }),
    ],
    ["deleted"],
  );
  assert.equal(assistantListsBadgeCount(doc, NOW), 2);
  assert.equal(
    assistantListsBadgeCount(doc, NOW),
    dueReminderItems(doc, NOW).length,
  );
  // Lists "Reminders N" / Inbox section: every open reminder, due or not.
  assert.equal(openAssistantReminderCount(doc), 4);
});

test("assistant badge rises live as a reminder comes due and clears when done", () => {
  let doc = docOf([item("a", { dueAt: NOW + 30 })]);
  assert.equal(assistantListsBadgeCount(doc, NOW), 0);
  assert.equal(assistantListsBadgeCount(doc, NOW + 30), 1);
  doc = setListItem(
    doc,
    "a",
    item("a", { dueAt: NOW + 30, status: "done" }),
    99,
  );
  assert.equal(assistantListsBadgeCount(doc, NOW + 30), 0);
  assert.equal(openAssistantReminderCount(doc), 0);
});

test("assist-list NIP-ER copies are not message reminders", () => {
  const copy = reminder({ id: "c", notBefore: NOW - 1, source: "assist-list" });
  const msg = reminder({ id: "m", notBefore: NOW - 1 });
  assert.equal(isAssistListCopy(copy), true);
  assert.equal(isAssistListCopy(msg), false);
  assert.deepEqual(
    inboxMessageReminders([copy, msg]).map((r) => r.id),
    ["m"],
  );
});

test("web: due count excludes copies; desktop keeps them", () => {
  const rs = [
    reminder({ id: "c1", notBefore: NOW - 1, source: "assist-list" }),
    reminder({ id: "c-stale", notBefore: NOW - 99, source: "assist-list" }),
    reminder({ id: "m", notBefore: NOW - 1 }),
    reminder({ id: "m-future", notBefore: NOW + 99 }),
    reminder({ id: "m-done", notBefore: NOW - 1, status: "done" }),
  ];
  assert.equal(countDueInboxReminders(rs, true, NOW), 1);
  assert.equal(countDueInboxReminders(rs, false, NOW), 3);
});

test("web Inbox Reminders badge equals the due items shown in the tab", () => {
  // JM's case: one Assistant reminder ("CHA", due) dual-written as an NIP-ER copy, plus a stale pending copy.
  const doc = docOf([item("cha", { dueAt: NOW - 3600, text: "CHA" })]);
  const nipEr = [
    reminder({ id: "cha-copy", notBefore: NOW - 3600, source: "assist-list" }),
    reminder({ id: "old-copy", notBefore: NOW - 7200, source: "assist-list" }),
  ];
  const badge =
    countDueInboxReminders(nipEr, true, NOW) +
    assistantListsBadgeCount(doc, NOW);
  // Before the fix this was countDue(nipEr) + assistant = 2 + 1 = 3 while one item was visible.
  assert.equal(badge, 1);

  const shownMessages = groupReminders(inboxMessageReminders(nipEr)).flatMap(
    (g) => g.reminders,
  );
  assert.equal(shownMessages.length, 0);
  const shownDue =
    shownMessages.filter((r) => isDue(r, NOW)).length +
    dueReminderItems(doc, NOW).length;
  assert.equal(badge, shownDue);
  // With an Assistant reminder listed, the message section must not render "No reminders".
  assert.ok(openAssistantReminderCount(doc) > 0);
});

test("web badge with message reminders too matches what is listed", () => {
  const doc = docOf([
    item("a", { dueAt: NOW - 1 }),
    item("b", { dueAt: NOW + 500 }),
  ]);
  const nipEr = [
    reminder({ id: "a-copy", notBefore: NOW - 1, source: "assist-list" }),
    reminder({ id: "b-copy", notBefore: NOW + 500, source: "assist-list" }),
    reminder({ id: "m1", notBefore: NOW - 5 }),
    reminder({ id: "m2", notBefore: NOW + 5 }),
  ];
  const shownMessages = groupReminders(inboxMessageReminders(nipEr)).flatMap(
    (g) => g.reminders,
  );
  const badge =
    countDueInboxReminders(nipEr, true, NOW) +
    assistantListsBadgeCount(doc, NOW);
  assert.equal(badge, 2);
  assert.equal(
    badge,
    shownMessages.filter((r) => isDue(r, NOW)).length +
      dueReminderItems(doc, NOW).length,
  );
});
