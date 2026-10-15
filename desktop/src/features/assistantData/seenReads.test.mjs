import assert from "node:assert/strict";
import test from "node:test";

import { planAssistantSeenReads } from "./seenReads.ts";

const A = "AA".repeat(32);
const ME = "bb".repeat(32);

test("assistant replies get per-message marks with their root; top-level gets the channel mark", () => {
  const plan = planAssistantSeenReads(
    [
      { id: "u1", pubkey: ME, created_at: 10, tags: [] },
      { id: "r1", pubkey: A.toLowerCase(), created_at: 11, tags: [["e", "u1", "", "root"]] },
      { id: "t1", pubkey: A, created_at: 12, tags: [] },
      { id: "t0", pubkey: A, created_at: 9, tags: [["p", ME]] },
    ],
    A,
    new Set(),
  );
  assert.deepEqual(plan.ids, ["r1", "t1", "t0"]);
  assert.deepEqual(plan.replies, [{ id: "r1", createdAt: 11, rootId: "u1" }]);
  assert.equal(plan.topLevelAt, 12);
});

test("ignores your own messages and ones already marked", () => {
  const plan = planAssistantSeenReads(
    [
      { id: "u1", pubkey: ME, created_at: 10, tags: [] },
      { id: "r1", pubkey: A, created_at: 11, tags: [["e", "u1"]] },
    ],
    A,
    new Set(["r1"]),
  );
  assert.deepEqual(plan, { ids: [], replies: [], topLevelAt: null });
});

test("first e tag is the root when none is marked", () => {
  const plan = planAssistantSeenReads(
    [{ id: "r2", pubkey: A, created_at: 5, tags: [["e", "x"], ["e", "y", "", "reply"]] }],
    A,
    new Set(),
  );
  assert.equal(plan.replies[0].rootId, "x");
});
