import assert from "node:assert/strict";
import test from "node:test";

import { projectTaskListMissesActivityCount } from "./projectTaskListFreshness.ts";

test("a higher rail count means the task list is missing tasks", () => {
  assert.equal(projectTaskListMissesActivityCount(3, 0), true);
  assert.equal(projectTaskListMissesActivityCount(3, 2), true);
});

test("a matching or higher list does not need another read", () => {
  assert.equal(projectTaskListMissesActivityCount(3, 3), false);
  assert.equal(projectTaskListMissesActivityCount(0, 0), false);
  assert.equal(projectTaskListMissesActivityCount(1, 4), false);
});

test("a missing count waits for that query", () => {
  assert.equal(projectTaskListMissesActivityCount(undefined, 0), false);
  assert.equal(projectTaskListMissesActivityCount(3, undefined), false);
  assert.equal(projectTaskListMissesActivityCount(null, 0), false);
});
