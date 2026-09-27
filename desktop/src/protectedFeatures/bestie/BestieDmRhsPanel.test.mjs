import assert from "node:assert/strict";
import test from "node:test";

import {
  bestieCategoryTitle,
  presentBestieContextCount,
} from "./bestieDmRhsHelpers.ts";

test("bestieCategoryTitle labels reminder and todo categories", () => {
  assert.equal(bestieCategoryTitle("reminder"), "Reminders");
  assert.equal(bestieCategoryTitle("todo"), "To-dos");
});

test("presentBestieContextCount omits empty like Projects overview", () => {
  assert.equal(presentBestieContextCount(undefined), undefined);
  assert.equal(presentBestieContextCount(0), undefined);
  assert.equal(presentBestieContextCount(3), 3);
});
