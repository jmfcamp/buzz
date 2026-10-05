import assert from "node:assert/strict";
import test from "node:test";

import {
  bestieThreadNeedsSummarize,
  bestieThreadSummarizeIdleLabel,
} from "./bestieThreadSummarizeEligibility.ts";

test("needs summarize when never summarized", () => {
  assert.equal(
    bestieThreadNeedsSummarize({ lastActiveAt: 100, lastSummaryAt: null }),
    true,
  );
});

test("needs summarize when activity newer than summary", () => {
  assert.equal(
    bestieThreadNeedsSummarize({ lastActiveAt: 200, lastSummaryAt: 100 }),
    true,
  );
});

test("hides summarize when summary is current", () => {
  assert.equal(
    bestieThreadNeedsSummarize({ lastActiveAt: 100, lastSummaryAt: 100 }),
    false,
  );
  assert.equal(
    bestieThreadNeedsSummarize({ lastActiveAt: 90, lastSummaryAt: 100 }),
    false,
  );
});

test("idle label stays Summarize for first-time never-summarized", () => {
  assert.equal(
    bestieThreadSummarizeIdleLabel({ lastActiveAt: 100, lastSummaryAt: null }),
    "Summarize",
  );
});

test("idle label is Resummarize when already summarized and activity is newer", () => {
  assert.equal(
    bestieThreadSummarizeIdleLabel({ lastActiveAt: 200, lastSummaryAt: 100 }),
    "Resummarize",
  );
});

test("idle label stays Summarize when summary is current", () => {
  assert.equal(
    bestieThreadSummarizeIdleLabel({ lastActiveAt: 100, lastSummaryAt: 100 }),
    "Summarize",
  );
});
