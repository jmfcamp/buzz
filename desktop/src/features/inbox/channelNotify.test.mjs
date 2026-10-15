import assert from "node:assert/strict";
import test from "node:test";

import { channelNotifyFromDoc, channelNotifyMode } from "./channelNotify.ts";
import { emptyInboxState } from "./inboxStateDoc.ts";

test("ch: ids map to channel notify modes; mute wins a concurrent all", () => {
  const doc = emptyInboxState();
  doc.lanes.followed["ch:a"] = { on: true, at: 5 };
  doc.lanes.muted["ch:b"] = { on: true, at: 5 };
  doc.lanes.followed["ch:c"] = { on: true, at: 5 };
  doc.lanes.muted["ch:c"] = { on: true, at: 5 };
  doc.lanes.followed["root1"] = { on: true, at: 5 }; // thread, ignored
  doc.lanes.followed["ch:d"] = { on: false, at: 6 };
  const sets = channelNotifyFromDoc(doc);
  assert.equal(channelNotifyMode(sets, "a"), "all");
  assert.equal(channelNotifyMode(sets, "b"), "mute");
  assert.equal(channelNotifyMode(sets, "c"), "mute");
  assert.equal(channelNotifyMode(sets, "d"), "mentions");
  assert.equal(channelNotifyMode(sets, "root1"), "mentions");
});
