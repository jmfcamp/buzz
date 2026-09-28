import assert from "node:assert/strict";
import test from "node:test";

import {
  bestieCategoryTitle,
  bestieIdleAuxiliaryKind,
  presentBestieContextCount,
} from "./bestieDmRhsHelpers.ts";

test("bestieCategoryTitle labels all RHS categories", () => {
  assert.equal(bestieCategoryTitle("reminder"), "Reminders");
  assert.equal(bestieCategoryTitle("todo"), "To-dos");
  assert.equal(bestieCategoryTitle("job"), "Jobs");
  assert.equal(bestieCategoryTitle("coffee"), "Coffee");
  assert.equal(bestieCategoryTitle("thread"), "Threads");
  assert.equal(bestieCategoryTitle("scratch"), "Scratch");
});

test("presentBestieContextCount omits empty like Projects overview", () => {
  assert.equal(presentBestieContextCount(undefined), undefined);
  assert.equal(presentBestieContextCount(0), undefined);
  assert.equal(presentBestieContextCount(3), 3);
});

test("bestieIdleAuxiliaryKind opens slide only for a drilled category", () => {
  assert.equal(bestieIdleAuxiliaryKind(null), null);
  assert.equal(bestieIdleAuxiliaryKind("thread"), "thread");
});
