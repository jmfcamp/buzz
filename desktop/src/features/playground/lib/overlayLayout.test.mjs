import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYGROUND_FULLSCREEN_TITLEBAR_GAP_TEST_ID,
  PLAYGROUND_OVERLAY_SURFACE_CLASS,
  PLAYGROUND_RESIZE_HANDLE_CLASS,
  PLAYGROUND_RESIZE_HANDLE_GUTTER_CLASS,
  playgroundFullscreenTitlebarGapClass,
  playgroundOverlaySurfaceIsOpaque,
  playgroundResizeHandleSitsOutsideHost,
  playgroundStageLayoutKey,
} from "./overlayLayout.ts";

test("fullscreen titlebar gap matches the app chrome strip", () => {
  assert.equal(
    PLAYGROUND_FULLSCREEN_TITLEBAR_GAP_TEST_ID,
    "playground-fullscreen-titlebar-gap",
  );
  assert.match(playgroundFullscreenTitlebarGapClass, /buzz-top-chrome-height/);
  assert.match(playgroundFullscreenTitlebarGapClass, /40px/);
  assert.equal(
    playgroundOverlaySurfaceIsOpaque(playgroundFullscreenTitlebarGapClass),
    true,
  );
});

test("overlay surface is fully opaque", () => {
  assert.equal(PLAYGROUND_OVERLAY_SURFACE_CLASS, "bg-background");
  assert.equal(
    playgroundOverlaySurfaceIsOpaque(PLAYGROUND_OVERLAY_SURFACE_CLASS),
    true,
  );
  assert.equal(
    playgroundOverlaySurfaceIsOpaque("absolute inset-0 z-30 bg-background/95"),
    false,
  );
  assert.equal(
    playgroundOverlaySurfaceIsOpaque("bg-background backdrop-blur"),
    false,
  );
});

test("resize handles sit outside the webview host", () => {
  assert.match(PLAYGROUND_RESIZE_HANDLE_GUTTER_CLASS, /pr-2/);
  assert.match(PLAYGROUND_RESIZE_HANDLE_GUTTER_CLASS, /pb-2/);
  assert.match(PLAYGROUND_RESIZE_HANDLE_CLASS.x, /w-2/);
  assert.match(PLAYGROUND_RESIZE_HANDLE_CLASS.y, /h-2/);
  assert.match(PLAYGROUND_RESIZE_HANDLE_CLASS.xy, /h-2/);
  const host = { contains: (node) => node === host };
  const handle = {};
  assert.equal(playgroundResizeHandleSitsOutsideHost(host, handle), true);
  assert.equal(playgroundResizeHandleSitsOutsideHost(host, host), false);
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
