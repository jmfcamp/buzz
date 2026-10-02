/**
 * A reaction click closes the picker and the message menu before the toggle
 * promise. A slow relay ack must not leave either one open.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(name) {
  return readFileSync(new URL(`./${name}`, import.meta.url), "utf8");
}

function between(text, startMark, endMark) {
  const start = text.indexOf(startMark);
  const end = text.indexOf(endMark, start + startMark.length);
  assert.ok(start !== -1 && end !== -1, `${startMark} .. ${endMark}`);
  return text.slice(start, end);
}

test("the message action bar closes reaction menus before the toggle settles", () => {
  const handler = between(
    source("MessageActionBar.tsx"),
    "const handleReactionSelection",
    "if (!hasReplyAction && !hasReactionAction && !hasMoreMenuActions)",
  );

  const pickerClose = handler.indexOf("setIsReactionPickerOpen(false)");
  const menuClose = handler.indexOf("setIsDropdownOpen(false)");
  const toggle = handler.indexOf("void onReactionSelect(emoji)");

  assert.ok(pickerClose !== -1);
  assert.ok(menuClose !== -1);
  assert.ok(toggle !== -1);
  assert.ok(pickerClose < toggle);
  assert.ok(menuClose < toggle);
  assert.equal(handler.includes(".finally("), false);
});

test("the system message picker closes before the reaction settles", () => {
  const picker = between(
    source("SystemMessageRow.tsx"),
    "<EmojiPicker",
    "</PopoverContent>",
  );

  const close = picker.indexOf("setIsReactionPickerOpen(false)");
  const toggle = picker.indexOf("void handleReactionSelect(value)");

  assert.ok(close !== -1);
  assert.ok(toggle !== -1);
  assert.ok(close < toggle);
  assert.equal(picker.includes(".finally("), false);
});
