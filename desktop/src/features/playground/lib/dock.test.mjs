import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYGROUND_DOCK_DEFAULT_WIDTH_PX,
  PLAYGROUND_DOCK_MIN_REMAINDER_PX,
  PLAYGROUND_DOCK_MIN_WIDTH_PX,
  clampPlaygroundDockWidth,
  defaultPlaygroundDockWidth,
  parseStoredPlaygroundDockWidth,
  playgroundDockLeavesMainClickable,
  playgroundOverlayPlacement,
  playgroundOverlaySearchState,
  playgroundOverlayShouldPortal,
  resolvePlaygroundDockWidth,
} from "./dock.ts";

test("placement treats dock as a split, not dismiss or fullscreen", () => {
  assert.equal(playgroundOverlayPlacement(false, false), "window");
  assert.equal(playgroundOverlayPlacement(false, true), "dock");
  assert.equal(playgroundOverlayPlacement(true, false), "fullscreen");
  assert.equal(playgroundOverlayPlacement(true, true), "fullscreen");
  assert.equal(playgroundOverlayShouldPortal(false), false);
  assert.equal(playgroundOverlayShouldPortal(true), true);
});

test("default dock width is half the main inset", () => {
  assert.equal(defaultPlaygroundDockWidth(1000), 500);
  assert.equal(defaultPlaygroundDockWidth(1200), 600);
  assert.equal(defaultPlaygroundDockWidth(0), PLAYGROUND_DOCK_DEFAULT_WIDTH_PX);
});

test("dock width clamp keeps a clickable remainder", () => {
  assert.equal(
    clampPlaygroundDockWidth(200, 1000),
    PLAYGROUND_DOCK_MIN_WIDTH_PX,
  );
  assert.equal(
    clampPlaygroundDockWidth(900, 1000),
    1000 - PLAYGROUND_DOCK_MIN_REMAINDER_PX,
  );
  assert.equal(clampPlaygroundDockWidth(500, 1000), 500);
});

test("stored dock width is session-only and re-clamped to the main inset", () => {
  assert.equal(parseStoredPlaygroundDockWidth(null), null);
  assert.equal(parseStoredPlaygroundDockWidth(""), null);
  assert.equal(parseStoredPlaygroundDockWidth("nope"), null);
  assert.equal(parseStoredPlaygroundDockWidth("640"), 640);
  assert.equal(resolvePlaygroundDockWidth(1000, 640), 640);
  assert.equal(resolvePlaygroundDockWidth(1000, 900), 720);
  assert.equal(resolvePlaygroundDockWidth(1000, null), 500);
});

test("search state reads dock/fullscreen attributes from the overlay", () => {
  const overlay = {
    getAttribute(name) {
      if (name === "data-fullscreen") return "true";
      if (name === "data-docked") return "true";
      return null;
    },
  };
  assert.deepEqual(playgroundOverlaySearchState(overlay), {
    docked: true,
    fullscreen: true,
    placement: "fullscreen",
  });
  assert.deepEqual(
    playgroundOverlaySearchState({
      getAttribute(name) {
        if (name === "data-docked") return "true";
        return null;
      },
    }),
    { docked: true, fullscreen: false, placement: "dock" },
  );
});

test("docked overlay leaves the right side of main uncovered", () => {
  const main = {
    getBoundingClientRect: () => ({ left: 256, width: 1000 }),
  };
  const docked = {
    getBoundingClientRect: () => ({ left: 256, width: 500 }),
  };
  const covering = {
    getBoundingClientRect: () => ({ left: 256, width: 1000 }),
  };
  assert.equal(playgroundDockLeavesMainClickable(docked, main), true);
  assert.equal(playgroundDockLeavesMainClickable(covering, main), false);
});
