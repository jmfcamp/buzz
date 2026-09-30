import assert from "node:assert/strict";
import test from "node:test";

import {
  collectThinkingContentItems,
  findNearestTurnIdByTime,
  findTurnIdForPromptEvent,
  formatTurnDuration,
  formatTurnTokens,
} from "./agentMessageTurnMeta.ts";

test("formatTurnDuration", () => {
  assert.equal(formatTurnDuration(null), null);
  assert.equal(formatTurnDuration(12), "12s");
  assert.equal(formatTurnDuration(65), "1:05");
  assert.equal(formatTurnDuration(600), "10:00");
});

test("formatTurnTokens", () => {
  assert.equal(formatTurnTokens(null), null);
  assert.equal(formatTurnTokens(42), "42");
  assert.equal(formatTurnTokens("1500"), "1.5k");
  assert.equal(formatTurnTokens("2000000"), "2.0M");
});

test("findTurnIdForPromptEvent matches triggeringEventIds", () => {
  const events = [
    {
      kind: "turn_started",
      turnId: "turn-a",
      payload: { triggeringEventIds: ["PROMPT1"] },
    },
  ];
  assert.equal(findTurnIdForPromptEvent(events, "prompt1"), "turn-a");
  assert.equal(findTurnIdForPromptEvent(events, "other"), null);
});

test("findNearestTurnIdByTime prefers turn with thinking content", () => {
  const items = [
    {
      id: "1",
      type: "lifecycle",
      timestamp: "2026-01-01T00:00:10Z",
      turnId: "t-life",
    },
    {
      id: "2",
      type: "thought",
      text: "hmm",
      timestamp: "2026-01-01T00:00:12Z",
      turnId: "t-think",
    },
  ];
  assert.equal(
    findNearestTurnIdByTime(items, Date.parse("2026-01-01T00:00:11Z") / 1000),
    "t-think",
  );
});

test("collectThinkingContentItems keeps thought/tool and orphans in window", () => {
  const items = [
    {
      id: "life",
      type: "lifecycle",
      timestamp: "2026-01-01T00:00:10Z",
      turnId: "t1",
    },
    {
      id: "th",
      type: "thought",
      text: "plan",
      timestamp: "2026-01-01T00:00:11Z",
      turnId: "t1",
    },
    {
      id: "orphan",
      type: "tool",
      title: "shell",
      timestamp: "2026-01-01T00:00:12Z",
      turnId: null,
    },
  ];
  const collected = collectThinkingContentItems(items, {
    turnId: "t1",
    windowStartSec: Date.parse("2026-01-01T00:00:00Z") / 1000,
    windowEndSec: Date.parse("2026-01-01T00:00:20Z") / 1000,
  });
  assert.deepEqual(collected.map((i) => i.id).sort(), ["orphan", "th"]);
});
