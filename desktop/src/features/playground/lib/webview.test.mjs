import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectPlaygroundWebview,
  isPlaygroundInspectTarget,
  playgroundWebviewId,
} from "./webview.ts";

test("inspect targets playground-{sid} and never main", async () => {
  assert.equal(playgroundWebviewId("demo-1"), "playground-demo-1");
  assert.equal(isPlaygroundInspectTarget("playground-demo-1"), true);
  assert.equal(isPlaygroundInspectTarget("main"), false);
  const result = await inspectPlaygroundWebview("demo-1");
  assert.equal(result.webviewId, "playground-demo-1");
  assert.notEqual(result.webviewId, "main");
});
