import assert from "node:assert/strict";
import test from "node:test";
import { relayReadRetry, relayReadRetryDelay, isTransientRelayError } from "./relayReadRetry.ts";

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
