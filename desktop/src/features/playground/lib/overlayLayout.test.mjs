import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYGROUND_FULLSCREEN_TITLEBAR_GAP_TEST_ID,
  playgroundFullscreenTitlebarGapClass,
  playgroundStageLayoutKey,
} from "./overlayLayout.ts";

test("fullscreen titlebar gap matches the app chrome strip", () => {
  assert.equal(
    PLAYGROUND_FULLSCREEN_TITLEBAR_GAP_TEST_ID,
    "playground-fullscreen-titlebar-gap",
  );
  assert.match(playgroundFullscreenTitlebarGapClass, /buzz-top-chrome-height/);
  assert.match(playgroundFullscreenTitlebarGapClass, /40px/);
});

test("stage layout key changes when fullscreen toggles", () => {
  assert.equal(playgroundStageLayoutKey(false, 0), "window:0");
  assert.equal(playgroundStageLayoutKey(true, 0), "fullscreen:0");
  assert.notEqual(
    playgroundStageLayoutKey(false, 0),
    playgroundStageLayoutKey(true, 0),
  );
  assert.notEqual(
    playgroundStageLayoutKey(true, 0),
    playgroundStageLayoutKey(true, 1),
  );
});
