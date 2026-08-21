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

test("inspect result does not describe a resized stage or the app webview", async () => {
  const result = await inspectPlaygroundWebview("stage-keep");
  assert.equal(result.webviewId, "playground-stage-keep");
  assert.equal(isPlaygroundInspectTarget(result.webviewId), true);
  assert.equal("width" in result, false);
  assert.equal("height" in result, false);
  assert.equal(result.webviewId.startsWith("playground-"), true);
});
