import assert from "node:assert/strict";
import test from "node:test";

import {
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

test("findNearestTurnIdByTime picks closest turn", () => {
  const items = [
    {
      id: "1",
      type: "thought",
      text: "a",
      timestamp: "2026-01-01T00:00:10Z",
      turnId: "t1",
    },
    {
      id: "2",
      type: "thought",
      text: "b",
      timestamp: "2026-01-01T00:05:00Z",
      turnId: "t2",
    },
  ];
  assert.equal(
    findNearestTurnIdByTime(
      items,
      Date.parse("2026-01-01T00:00:12Z") / 1000,
    ),
    "t1",
  );
});
