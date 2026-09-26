import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPlaygroundViewport,
  getPlaygroundViewport,
  playgroundViewportCaption,
  resetPlaygroundViewports,
  setPlaygroundViewport,
} from "./playgroundViewport.ts";

test("caption: Desktop without dims", () => {
  assert.equal(
    playgroundViewportCaption({ mode: "desktop", width: 0, height: 0 }),
    "Desktop",
  );
});

test("caption: Desktop · W×H", () => {
  assert.equal(
    playgroundViewportCaption({ mode: "desktop", width: 1280, height: 800 }),
    "Desktop · 1280×800",
  );
});

test("caption: Responsive · W×H", () => {
  assert.equal(
    playgroundViewportCaption({
      mode: "responsive",
      width: 390,
      height: 844,
    }),
    "Responsive · 390×844",
  );
});

test("caption: Mobile dims; scale only when not 100%", () => {
  assert.equal(
    playgroundViewportCaption({
      mode: "mobile",
      width: 393,
      height: 852,
      scalePercent: 100,
    }),
    "Mobile · 393×852",
  );
  assert.equal(
    playgroundViewportCaption({
      mode: "mobile",
      width: 590,
      height: 1278,
      scalePercent: 150,
    }),
    "Mobile · 590×1278 · 150%",
  );
});

test("set/get/clear viewport store", () => {
  resetPlaygroundViewports();
  assert.equal(getPlaygroundViewport("a").mode, "desktop");
  setPlaygroundViewport("a", {
    mode: "mobile",
    width: 393,
    height: 852,
    scalePercent: 125,
  });
  assert.deepEqual(getPlaygroundViewport("a"), {
    mode: "mobile",
    width: 393,
    height: 852,
    scalePercent: 125,
  });
  clearPlaygroundViewport("a");
  assert.equal(getPlaygroundViewport("a").mode, "desktop");
  resetPlaygroundViewports();
});
