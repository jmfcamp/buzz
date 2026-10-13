import assert from "node:assert/strict";
import test from "node:test";
const { touchDeleteSeq } = await import("./TerminalSubstrate.tsx");
const node = {};
const r = (a, b, c = node) => ({ startContainer: node, endContainer: c, startOffset: a, endOffset: b });
test("iOS held backspace: char -> DEL, word steps -> ^W, line -> ^U", () => {
  assert.equal(touchDeleteSeq({ inputType: "deleteContentBackward" }), "\x7f");
  assert.equal(touchDeleteSeq({ inputType: "deleteContentBackward", getTargetRanges: () => [r(9, 10)] }), "\x7f");
  assert.equal(touchDeleteSeq({ inputType: "deleteContentBackward", getTargetRanges: () => [r(4, 10)] }), "\x17");
  assert.equal(touchDeleteSeq({ inputType: "deleteWordBackward" }), "\x17");
  assert.equal(touchDeleteSeq({ inputType: "deleteSoftLineBackward" }), "\x15");
  assert.equal(touchDeleteSeq({ inputType: "insertText" }), null);
});
