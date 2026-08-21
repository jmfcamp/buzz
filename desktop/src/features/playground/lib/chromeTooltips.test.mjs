import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAYGROUND_CHROME_TOOLTIPS,
  PLAYGROUND_ICON_ONLY_CHROME_TOOLTIP_IDS,
  playgroundChromeTooltip,
  playgroundDockTooltip,
  playgroundFullscreenTooltip,
} from "./chromeTooltips.ts";

test("every icon-only chrome control has a delayed-tooltip label", () => {
  for (const id of PLAYGROUND_ICON_ONLY_CHROME_TOOLTIP_IDS) {
    const label = playgroundChromeTooltip(id);
    assert.equal(typeof label, "string");
    assert.ok(label.length > 0);
    assert.equal(label, PLAYGROUND_CHROME_TOOLTIPS[id]);
  }
  assert.equal(playgroundChromeTooltip("dispose"), "Dispose");
  assert.equal(playgroundChromeTooltip("back"), "Back");
  assert.equal(playgroundChromeTooltip("forward"), "Forward");
  assert.equal(playgroundChromeTooltip("refresh"), "Refresh");
  assert.equal(playgroundChromeTooltip("copy"), "Copy URL");
  assert.equal(playgroundChromeTooltip("inspect"), "Inspect");
  assert.equal(playgroundChromeTooltip("screenshot"), "Screenshot");
  assert.equal(playgroundChromeTooltip("dismiss"), "Dismiss");
  assert.equal(playgroundChromeTooltip("dock"), "Dock left");
  assert.equal(playgroundChromeTooltip("expand"), "Expand overlay");
});

test("fullscreen and dock tooltips invert with the current layout", () => {
  assert.equal(playgroundFullscreenTooltip(false), "Fullscreen");
  assert.equal(playgroundFullscreenTooltip(true), "Exit fullscreen");
  assert.equal(playgroundDockTooltip(false), "Dock left");
  assert.equal(playgroundDockTooltip(true), "Expand overlay");
});
