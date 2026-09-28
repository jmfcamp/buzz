import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetBestiePopoverSizeForTests,
  BESTIE_POPOVER_DEFAULT_MAX_HEIGHT_PX,
  BESTIE_POPOVER_DEFAULT_WIDTH_PX,
  BESTIE_POPOVER_MIN_HEIGHT_CHAT_PX,
  BESTIE_POPOVER_MIN_HEIGHT_WITH_LISTS_PX,
  BESTIE_POPOVER_MIN_WIDTH_PX,
  bestiePopoverMinHeightPx,
  setBestiePopoverSize,
} from "./bestiePopoverSizePreference.ts";

function memoryWindow() {
  const memory = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => memory.get(key) ?? null,
      removeItem: (key) => {
        memory.delete(key);
      },
      setItem: (key, value) => {
        memory.set(key, String(value));
      },
    },
  };
}

test("defaults are taller and wider than the old fixed popover", () => {
  memoryWindow();
  __resetBestiePopoverSizeForTests();
  assert.equal(BESTIE_POPOVER_DEFAULT_WIDTH_PX, 448);
  assert.equal(BESTIE_POPOVER_DEFAULT_MAX_HEIGHT_PX, 720);
  assert.ok(BESTIE_POPOVER_DEFAULT_WIDTH_PX > 320);
  assert.ok(BESTIE_POPOVER_DEFAULT_MAX_HEIGHT_PX > 512);
});

test("setBestiePopoverSize clamps and persists", () => {
  memoryWindow();
  __resetBestiePopoverSizeForTests();
  const next = setBestiePopoverSize({ widthPx: 100, maxHeightPx: 9999 });
  assert.equal(next.widthPx, BESTIE_POPOVER_MIN_WIDTH_PX);
  assert.equal(next.maxHeightPx, 960);
  const again = setBestiePopoverSize({ widthPx: 500 });
  assert.equal(again.widthPx, 500);
  assert.equal(again.maxHeightPx, 960);
});

test("Lists-open min height is higher than chat-only min", () => {
  assert.equal(bestiePopoverMinHeightPx(true), BESTIE_POPOVER_MIN_HEIGHT_CHAT_PX);
  assert.equal(
    bestiePopoverMinHeightPx(false),
    BESTIE_POPOVER_MIN_HEIGHT_WITH_LISTS_PX,
  );
  assert.ok(
    BESTIE_POPOVER_MIN_HEIGHT_WITH_LISTS_PX > BESTIE_POPOVER_MIN_HEIGHT_CHAT_PX,
  );
});

test("setBestiePopoverSize respects Lists-open minHeightPx option", () => {
  memoryWindow();
  __resetBestiePopoverSizeForTests();
  const next = setBestiePopoverSize(
    { maxHeightPx: 200 },
    { minHeightPx: BESTIE_POPOVER_MIN_HEIGHT_WITH_LISTS_PX },
  );
  assert.equal(next.maxHeightPx, BESTIE_POPOVER_MIN_HEIGHT_WITH_LISTS_PX);
});
