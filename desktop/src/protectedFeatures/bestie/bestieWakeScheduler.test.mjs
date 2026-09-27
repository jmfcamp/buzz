import assert from "node:assert/strict";
import test from "node:test";

import {
  addBestieListItem,
  emptyBestieListState,
} from "./bestieListStorage.ts";
import { evaluateBestieWake } from "./bestieWakeScheduler.ts";

test("evaluateBestieWake nudges on due reminders and open todos", () => {
  let state = emptyBestieListState();
  state = addBestieListItem(
    state,
    { kind: "reminder", text: "Due soon", dueAt: 100 },
    50,
  );
  state = addBestieListItem(state, { kind: "todo", text: "Open item" }, 50);
  const first = evaluateBestieWake(state, 100);
  assert.equal(first.shouldWakeAgent, true);
  assert.ok(first.nudge);
  assert.match(first.nudge.body, /Due soon|reminders/i);
  assert.match(first.nudge.body, /Open item|to-dos/i);

  const same = evaluateBestieWake(state, 100, {
    previousNudgeId: first.nudge.id,
  });
  assert.equal(same.nudge, null);
  assert.equal(same.shouldWakeAgent, false);
});

test("evaluateBestieWake is quiet when lists are empty", () => {
  const result = evaluateBestieWake(emptyBestieListState(), 100);
  assert.equal(result.nudge, null);
  assert.equal(result.shouldWakeAgent, false);
});
