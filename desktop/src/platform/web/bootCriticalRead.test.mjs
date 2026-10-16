import assert from "node:assert/strict";
import test from "node:test";
import { isBootCriticalRead } from "./bootCriticalRead.ts";

test("project, repo, section and scoped tombstone reads are boot-critical", () => {
  assert.equal(isBootCriticalRead([{ kinds: [30621], limit: 500 }]), true);
  assert.equal(isBootCriticalRead([{ kinds: [30617] }]), true);
  assert.equal(isBootCriticalRead([{ kinds: [30625], "#d": ["x"] }]), true);
  assert.equal(isBootCriticalRead([{ kinds: [5], "#a": ["30621:a:b"] }]), true);
});
test("channel history, unscoped deletions and kindless filters are not", () => {
  assert.equal(isBootCriticalRead([{ kinds: [9], "#h": ["c"] }]), false);
  assert.equal(isBootCriticalRead([{ kinds: [5] }]), false);
  assert.equal(isBootCriticalRead([{ ids: ["x"] }]), false);
  assert.equal(isBootCriticalRead([]), false);
});
