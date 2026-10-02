import assert from "node:assert/strict";
import test from "node:test";

import {
  groupByTaskStatus,
  taskNextStepLabel,
  taskStatusWord,
  viewerCanSelfAssignTask,
} from "./taskStatus.ts";

test("protocol statuses collapse to queued, in progress, and done", () => {
  assert.equal(taskStatusWord("Triage"), "queued");
  assert.equal(taskStatusWord("Backlog"), "queued");
  assert.equal(taskStatusWord("In Progress"), "in progress");
  assert.equal(taskStatusWord("In Review"), "in progress");
  assert.equal(taskStatusWord("Done"), "done");
  assert.equal(taskStatusWord("Closed"), "done");
});

test("triage and backlog share one queued group", () => {
  const groups = groupByTaskStatus([
    { status: "Triage", id: "a" },
    { status: "Backlog", id: "b" },
    { status: "In Review", id: "c" },
    { status: "Done", id: "d" },
    { status: "Closed", id: "e" },
  ]);
  assert.deepEqual(
    groups.map((group) => [group.word, group.items.map((item) => item.id)]),
    [
      ["queued", ["a", "b"]],
      ["in progress", ["c"]],
      ["done", ["d", "e"]],
    ],
  );
});

test("done tasks are viewed and every other status opens", () => {
  assert.equal(taskNextStepLabel("Done"), "View task");
  assert.equal(taskNextStepLabel("Closed"), "View task");
  assert.equal(taskNextStepLabel("In Review"), "Open task");
  assert.equal(taskNextStepLabel("Triage"), "Open task");
});

test("only an agent profile can assign the task to themselves", () => {
  assert.equal(viewerCanSelfAssignTask({ isAgent: true }), true);
  assert.equal(viewerCanSelfAssignTask({ isAgent: false }), false);
  assert.equal(viewerCanSelfAssignTask(undefined), false);
});
