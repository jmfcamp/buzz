import assert from "node:assert/strict";
import test from "node:test";
import {
  framePriority,
  paceRelayFrame,
  resetRelayFramePacer,
  shouldPaceFrame,
} from "./relayFramePacer.ts";

test("a cold-start burst of 120 frames is not delayed", async () => {
  resetRelayFramePacer();
  const start = Date.now();
  await Promise.all(Array.from({ length: 120 }, () => paceRelayFrame()));
  assert.ok(Date.now() - start < 50);
});

test("past the burst, frames are spread at ~16/s", async () => {
  resetRelayFramePacer();
  const start = Date.now();
  await Promise.all(Array.from({ length: 124 }, () => paceRelayFrame()));
  const ms = Date.now() - start;
  assert.ok(ms >= 180 && ms < 600, `took ${ms}ms`);
});

test("control frames jump ahead of queued publishes", async () => {
  resetRelayFramePacer();
  await Promise.all(Array.from({ length: 120 }, () => paceRelayFrame()));
  const order = [];
  const pubs = Array.from({ length: 3 }, (_, i) =>
    paceRelayFrame("publish").then(() => order.push(`pub${i}`)),
  );
  const req = paceRelayFrame("control").then(() => order.push("req"));
  await Promise.all([...pubs, req]);
  assert.equal(order[0], "req");
});

test("AUTH is never paced; EVENT is publish priority", () => {
  assert.equal(shouldPaceFrame(["AUTH", {}]), false);
  assert.equal(shouldPaceFrame(["REQ", "x", {}]), true);
  assert.equal(framePriority(["EVENT", {}]), "publish");
  assert.equal(framePriority(["REQ", "x", {}]), "control");
  assert.equal(framePriority(["CLOSE", "x"]), "control");
});

test("never exceeds the relay's 200-frames-per-5s window", async () => {
  resetRelayFramePacer();
  const sent = [];
  const start = Date.now();
  await Promise.all(
    Array.from({ length: 220 }, () =>
      paceRelayFrame().then(() => sent.push(Date.now() - start)),
    ),
  );
  const in5s = sent.filter((t) => t < 5000).length;
  assert.ok(in5s <= 200, `${in5s} frames in first 5s`);
});
