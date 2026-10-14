import assert from "node:assert/strict";
import test from "node:test";
import { isFrameableScheme, isKnownFrameBlockedUrl } from "./webFrame.ts";

test("known framing-hostile hosts are flagged, subdomains too", () => {
  assert.equal(isKnownFrameBlockedUrl("https://github.com/x"), true);
  assert.equal(isKnownFrameBlockedUrl("https://docs.google.com/a"), true);
  assert.equal(isKnownFrameBlockedUrl("https://wayfinder.huladesk.com"), false);
  assert.equal(isKnownFrameBlockedUrl("https://notgithub.com"), false);
});

test("only http(s) frames", () => {
  assert.equal(isFrameableScheme("https://a.com"), true);
  assert.equal(isFrameableScheme("javascript:alert(1)"), false);
});
