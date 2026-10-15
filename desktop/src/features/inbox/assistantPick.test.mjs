import assert from "node:assert/strict";
import test from "node:test";

import { assistantFromDoc, isAssistantPickId } from "./assistantPickDoc.ts";
import { emptyInboxState } from "./inboxStateDoc.ts";

const A = "a".repeat(64);
const B = "b".repeat(64);

test("newest live as: entry wins; tombstones and bad ids ignored", () => {
  const doc = emptyInboxState();
  assert.equal(assistantFromDoc(doc), null);
  doc.lanes.followed[`as:${A}`] = { on: true, at: 10 };
  doc.lanes.followed[`as:${B}`] = { on: false, at: 20 };
  doc.lanes.followed["as:nothex"] = { on: true, at: 30 };
  doc.lanes.followed["ch:x"] = { on: true, at: 40 };
  assert.equal(assistantFromDoc(doc), A);
  doc.lanes.followed[`as:${B}`] = { on: true, at: 21 };
  assert.equal(assistantFromDoc(doc), B);
  assert.equal(isAssistantPickId(`as:${A}`), true);
  assert.equal(isAssistantPickId("ch:1"), false);
});
