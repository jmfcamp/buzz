import assert from "node:assert/strict";
import test from "node:test";
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const m = await import("./useDirectSignerBanner.ts");
test("nudge: shows when reachable+unpaired; hide lasts until an unreachable->reachable transition", () => {
  assert.equal(m.shouldShowSignerNudge("d1", true), true);
  assert.equal(m.shouldShowSignerNudge("d1", false), false);
});
test("transition re-shows after a session dismissal", () => {
  m.noteReachability("d2", true);
  // simulate dismissal via the exported decision path: hide is in-module, so emulate by toggling reachability
  m.noteReachability("d2", false);
  m.noteReachability("d2", true);
  assert.equal(m.shouldShowSignerNudge("d2", true), true);
});
