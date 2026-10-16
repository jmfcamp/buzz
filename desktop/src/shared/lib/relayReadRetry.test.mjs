import assert from "node:assert/strict";
import test from "node:test";
import {
  relayReadRetry,
  relayReadRetryDelay,
  isTransientRelayError,
} from "./relayReadRetry.ts";

test("rate limits keep retrying well past a minute", () => {
  const e = new Error("rate-limited: quota exceeded; retry in 4s");
  assert.ok(isTransientRelayError(e));
  assert.equal(relayReadRetry(20, e), true);
  assert.equal(relayReadRetry(30, e), false);
  const d = relayReadRetryDelay(5, e);
  assert.ok(d >= 4000 && d < 5000);
});

test("other errors stop after two tries", () => {
  const e = new Error("Only the project owner can add repositories.");
  assert.equal(relayReadRetry(1, e), true);
  assert.equal(relayReadRetry(2, e), false);
});

test("boot connection errors retry sub-second first, never past 2.25s", () => {
  const e = new Error("Relay connection attempt was superseded.");
  assert.ok(relayReadRetryDelay(0, e) < 600);
  for (let i = 0; i < 30; i++) assert.ok(relayReadRetryDelay(i, e) < 2_250);
  let total = 0;
  for (let i = 0; i < 5; i++) total += relayReadRetryDelay(i, e);
  assert.ok(total < 6_000, `5 retries took ${total}ms`);
});

test("other errors back off to at most ~8s", () => {
  const e = new Error("boom");
  assert.ok(relayReadRetryDelay(0, e) < 750);
  assert.ok(relayReadRetryDelay(20, e) < 8_250);
});
