import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isKeyboardCapableElement,
  keyboardInset,
  phoneKeyboardOpen,
  visualKeyboardOpen,
  visualViewportCoveredPx,
} from "./phoneKeyboard.ts";

test("visualKeyboardOpen: short visual viewport looks like a keyboard", () => {
  assert.equal(visualKeyboardOpen({ height: 800, offsetTop: 0, width: 390 }, 800), false);
  assert.equal(visualKeyboardOpen({ height: 470, offsetTop: 0, width: 390 }, 800), true);
  assert.equal(visualViewportCoveredPx({ height: 470, offsetTop: 40, width: 390 }, 800) > 120, true);
});

test("keyboardInset: wanted=false never reports open even when VV is short", () => {
  const short = { height: 470, offsetTop: 0, width: 390 };
  assert.equal(keyboardInset(short, 800).open, true);
  assert.equal(keyboardInset(short, 800, 120, false).open, false);
  assert.equal(keyboardInset(short, 800, 120, false).height, 800);
  assert.equal(keyboardInset(null, 800).open, false);
});

test("phoneKeyboardOpen requires capable focus", () => {
  const short = { height: 470, offsetTop: 0, width: 390 };
  assert.equal(phoneKeyboardOpen({ vv: short, innerHeight: 800, maxH: 800, focused: false }), false);
  assert.equal(phoneKeyboardOpen({ vv: short, innerHeight: 800, maxH: 800, focused: true }), true);
  assert.equal(
    phoneKeyboardOpen({ vv: { height: 800, offsetTop: 0, width: 390 }, innerHeight: 800, maxH: 800, focused: true }),
    false,
  );
});

test("isKeyboardCapableElement ignores inputmode=none seed fields", { skip: typeof HTMLTextAreaElement === "undefined" && "needs DOM" }, () => {
  const area = { readOnly: false, disabled: false, inputMode: "none" };
  Object.setPrototypeOf(area, HTMLTextAreaElement.prototype);
  assert.equal(isKeyboardCapableElement(area), false);
  area.inputMode = "text";
  assert.equal(isKeyboardCapableElement(area), true);
});
