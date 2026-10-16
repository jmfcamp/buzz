import assert from "node:assert/strict";
import test from "node:test";
import { paceRelayFrame, resetRelayFramePacer, shouldPaceFrame } from "./relayFramePacer.ts";

test("a burst past capacity is spread out instead of sent at once", async () => {
  resetRelayFramePacer();
  const start = Date.now();
  await Promise.all(Array.from({ length: 23 }, () => paceRelayFrame()));
  assert.ok(Date.now() - start >= 400, "3 frames over capacity wait ~0.5s");
});

test("AUTH is never paced", () => {
  assert.equal(shouldPaceFrame(["AUTH", {}]), false);
  assert.equal(shouldPaceFrame(["REQ", "x", {}]), true);
});
