import assert from "node:assert/strict";
import test from "node:test";

import {
  DRIVE_ACTIVITY_CLEAR_MS,
  DRIVE_ACTIVITY_TURN_IDLE_MS,
} from "./driveActivityCaption.ts";
import {
  driveActivityTimerMs,
  INITIAL_DRIVE_ACTIVITY,
  reduceDriveActivity,
} from "./driveActivityState.ts";

test("TURN_IDLE_MS covers LLM think-time (~12–15s)", () => {
  assert.ok(DRIVE_ACTIVITY_TURN_IDLE_MS >= 12_000);
  assert.ok(DRIVE_ACTIVITY_TURN_IDLE_MS <= 15_000);
  assert.ok(DRIVE_ACTIVITY_CLEAR_MS >= 1_500);
  assert.ok(DRIVE_ACTIVITY_CLEAR_MS <= 2_000);
});

test("idle → activity becomes active with caption", () => {
  const next = reduceDriveActivity(INITIAL_DRIVE_ACTIVITY, {
    type: "activity",
    caption: "Taking snapshot…",
  });
  assert.deepEqual(next, { phase: "active", text: "Taking snapshot…" });
  assert.equal(driveActivityTimerMs(next), DRIVE_ACTIVITY_TURN_IDLE_MS);
});

test("active updates caption without finishing between tools", () => {
  let state = reduceDriveActivity(INITIAL_DRIVE_ACTIVITY, {
    type: "activity",
    caption: "Taking snapshot…",
  });
  state = reduceDriveActivity(state, {
    type: "activity",
    caption: "Clicking Submit…",
  });
  state = reduceDriveActivity(state, {
    type: "activity",
    caption: "Typing…",
  });
  assert.equal(state.phase, "active");
  assert.equal(state.text, "Typing…");
  // Short idle must NOT finish — only turn_idle does.
  const stillActive = reduceDriveActivity(state, { type: "clear" });
  assert.equal(stillActive.phase, "active");
  assert.equal(stillActive.text, "Typing…");
});

test("turn_idle while active → Finished + clear timer", () => {
  const active = reduceDriveActivity(INITIAL_DRIVE_ACTIVITY, {
    type: "activity",
    caption: "Driving…",
  });
  const finishing = reduceDriveActivity(active, { type: "turn_idle" });
  assert.deepEqual(finishing, { phase: "finishing", text: "Finished" });
  assert.equal(driveActivityTimerMs(finishing), DRIVE_ACTIVITY_CLEAR_MS);
});

test("activity during finishing resumes the turn (no premature clear)", () => {
  let state = reduceDriveActivity(INITIAL_DRIVE_ACTIVITY, {
    type: "activity",
    caption: "Taking snapshot…",
  });
  state = reduceDriveActivity(state, { type: "turn_idle" });
  assert.equal(state.phase, "finishing");
  state = reduceDriveActivity(state, {
    type: "activity",
    caption: "Clicking link…",
  });
  assert.deepEqual(state, { phase: "active", text: "Clicking link…" });
  assert.equal(driveActivityTimerMs(state), DRIVE_ACTIVITY_TURN_IDLE_MS);
});

test("clear after finishing → idle empty", () => {
  let state = reduceDriveActivity(INITIAL_DRIVE_ACTIVITY, {
    type: "activity",
    caption: "Scrolling…",
  });
  state = reduceDriveActivity(state, { type: "turn_idle" });
  state = reduceDriveActivity(state, { type: "clear" });
  assert.deepEqual(state, INITIAL_DRIVE_ACTIVITY);
  assert.equal(driveActivityTimerMs(state), null);
});

test("turn_idle / clear ignored when not in the right phase", () => {
  assert.deepEqual(
    reduceDriveActivity(INITIAL_DRIVE_ACTIVITY, { type: "turn_idle" }),
    INITIAL_DRIVE_ACTIVITY,
  );
  assert.deepEqual(
    reduceDriveActivity(INITIAL_DRIVE_ACTIVITY, { type: "clear" }),
    INITIAL_DRIVE_ACTIVITY,
  );
});

test("reset wipes mid-turn (mode off) but take-control is not a reset", () => {
  const active = reduceDriveActivity(INITIAL_DRIVE_ACTIVITY, {
    type: "activity",
    caption: "Typing…",
  });
  assert.deepEqual(reduceDriveActivity(active, { type: "reset" }), INITIAL_DRIVE_ACTIVITY);
});
