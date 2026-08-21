import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYGROUND_CHROME_CLASS,
  PLAYGROUND_FULLSCREEN_OVERLAY_CLASS,
  PLAYGROUND_FULLSCREEN_TITLEBAR_GAP_TEST_ID,
  PLAYGROUND_OPAQUE_FILL_STYLE,
  PLAYGROUND_OVERLAY_SURFACE_CLASS,
  PLAYGROUND_RESIZE_HANDLE_CLASS,
  PLAYGROUND_RESIZE_HANDLE_GUTTER_CLASS,
  PLAYGROUND_WINDOWED_OVERLAY_CLASS,
  playgroundFullscreenDragRegionIsGapOnly,
  playgroundFullscreenOverlayIsPortaled,
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
  assert.doesNotMatch(
    PLAYGROUND_FULLSCREEN_OVERLAY_CLASS,
    /backdrop-blur|\/\d+/,
  );
  assert.doesNotMatch(PLAYGROUND_WINDOWED_OVERLAY_CLASS, /backdrop-blur|\/\d+/);
  assert.equal(
    playgroundOverlaySurfaceIsOpaque(PLAYGROUND_OVERLAY_SURFACE_CLASS),
    true,
  );
  assert.equal(playgroundOverlaySurfaceIsOpaque(PLAYGROUND_CHROME_CLASS), true);
  assert.doesNotMatch(PLAYGROUND_CHROME_CLASS, /backdrop-blur|\/\d+/);
  assert.equal(
    playgroundOverlaySurfaceIsOpaque("absolute inset-0 z-30 bg-background/95"),
    false,
  );
  assert.equal(
    playgroundOverlaySurfaceIsOpaque("bg-background backdrop-blur"),
    false,
  );
  assert.equal(
    playgroundOverlaySurfaceIsOpaque("bg-background/80 backdrop-blur-md"),
    false,
  );
  assert.match(PLAYGROUND_OPAQUE_FILL_STYLE.backgroundColor, /\/ 1\)$/);
  assert.doesNotMatch(PLAYGROUND_OPAQUE_FILL_STYLE.backgroundColor, /backdrop/);
});

test("fullscreen drag region is only the titlebar gap", () => {
  const gap = {
    hasAttribute: (name) => name === "data-tauri-drag-region",
    contains: () => false,
  };
  const chrome = {
    hasAttribute: () => false,
    querySelector: () => null,
  };
  assert.equal(playgroundFullscreenDragRegionIsGapOnly(gap, chrome), true);
  assert.equal(
    playgroundFullscreenDragRegionIsGapOnly(gap, {
      hasAttribute: (name) => name === "data-tauri-drag-region",
      querySelector: () => null,
    }),
    false,
  );
  assert.equal(
    playgroundFullscreenDragRegionIsGapOnly(
      { ...gap, contains: () => true },
      chrome,
    ),
    false,
  );
});

test("fullscreen overlay is portaled onto document.body", () => {
  const body = {};
  const overlay = { parentElement: body, ownerDocument: { body } };
  assert.equal(playgroundFullscreenOverlayIsPortaled(overlay), true);
  assert.equal(
    playgroundFullscreenOverlayIsPortaled({
      parentElement: {},
      ownerDocument: { body },
    }),
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
