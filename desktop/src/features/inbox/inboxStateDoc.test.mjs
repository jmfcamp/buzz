import assert from "node:assert/strict";
import test from "node:test";

import {
  activeIds,
  emptyInboxState,
  INBOX_STATE_TOMBSTONE_SECONDS,
  mergeInboxState,
  parseInboxState,
  pruneInboxState,
  sameInboxState,
  setInboxStateEntry,
  unionLegacyInboxState,
} from "./inboxStateDoc.ts";

test("per-id last writer wins across devices", () => {
  let desk = setInboxStateEntry(emptyInboxState(), "done", "a", true, 100);
  let web = setInboxStateEntry(emptyInboxState(), "done", "a", false, 200);
  web = setInboxStateEntry(web, "done", "b", true, 150);
  const m1 = mergeInboxState(desk, web);
  const m2 = mergeInboxState(web, desk);
  assert.ok(sameInboxState(m1, m2), "commutative");
  assert.deepEqual(activeIds(m1, "done"), ["b"]);
  desk = setInboxStateEntry(m1, "done", "a", true, 120); // clock behind: still moves past 200
  assert.equal(desk.lanes.done.a.at, 201);
  assert.deepEqual(activeIds(desk, "done").sort(), ["a", "b"]);
});

test("ties prefer removal and merge is idempotent", () => {
  const on = setInboxStateEntry(emptyInboxState(), "muted", "r", true, 10);
  const off = setInboxStateEntry(emptyInboxState(), "muted", "r", false, 10);
  assert.deepEqual(activeIds(mergeInboxState(on, off), "muted"), []);
  const m = mergeInboxState(on, on);
  assert.ok(sameInboxState(m, on));
});

test("tombstones expire after 30 days, live entries never do", () => {
  const now = 10 * INBOX_STATE_TOMBSTONE_SECONDS;
  let d = setInboxStateEntry(
    emptyInboxState(),
    "followed",
    "old-off",
    false,
    1,
  );
  d = setInboxStateEntry(d, "followed", "new-off", false, now - 60);
  d = setInboxStateEntry(d, "followed", "old-on", true, 1);
  const p = pruneInboxState(d, now);
  assert.equal(p.lanes.followed["old-off"], undefined);
  assert.ok(p.lanes.followed["new-off"]);
  assert.ok(p.lanes.followed["old-on"].on);
});

test("legacy union migrates local ids but loses to any real remote decision", () => {
  const remote = setInboxStateEntry(emptyInboxState(), "done", "x", false, 50);
  const migrated = unionLegacyInboxState(remote, {
    done: ["x", "y"],
    starred: [
      { rootId: "s", meta: { channelId: "c", title: "T", channelName: "n" } },
    ],
  });
  assert.deepEqual(activeIds(migrated, "done"), ["y"]);
  assert.equal(migrated.lanes.starred.s.meta.channelId, "c");
});

test("parse is tolerant and round-trips", () => {
  const d = setInboxStateEntry(emptyInboxState(), "unread", "u", true, 5);
  const back = parseInboxState(JSON.parse(JSON.stringify(d)));
  assert.ok(sameInboxState(back, d));
  assert.equal(parseInboxState({ v: 2 }), null);
  const loose = parseInboxState({
    v: 1,
    lanes: { done: { a: { on: true, at: 1 }, b: { on: "x" } }, bogus: {} },
  });
  assert.deepEqual(activeIds(loose, "done"), ["a"]);
});
