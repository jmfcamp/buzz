import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearPinnedSiteOpenUrl,
  consumePinnedSiteOpenUrl,
  queuePinnedSiteOpenUrl,
  resetPendingPinnedSiteOpenForTests,
  subscribePinnedSiteOpenUrl,
} from "./pendingPinOpen.ts";

test("queue then consume peeks the full URL and stays sticky until clear", () => {
  resetPendingPinnedSiteOpenForTests();
  queuePinnedSiteOpenUrl("pin-1", "https://example.com/blog/post?x=1");
  assert.equal(
    consumePinnedSiteOpenUrl("pin-1", "https://example.com/"),
    "https://example.com/blog/post?x=1",
  );
  // Peek must survive Strict Mode remount / second consume.
  assert.equal(
    consumePinnedSiteOpenUrl("pin-1", "https://example.com/"),
    "https://example.com/blog/post?x=1",
  );
  clearPinnedSiteOpenUrl("pin-1", "https://example.com/blog/post?x=1");
  assert.equal(
    consumePinnedSiteOpenUrl("pin-1", "https://example.com/"),
    "https://example.com/",
  );
});

test("clear with mismatched URL leaves a newer pending entry", () => {
  resetPendingPinnedSiteOpenForTests();
  queuePinnedSiteOpenUrl("pin-1", "https://example.com/old");
  queuePinnedSiteOpenUrl("pin-1", "https://example.com/new");
  clearPinnedSiteOpenUrl("pin-1", "https://example.com/old");
  assert.equal(
    consumePinnedSiteOpenUrl("pin-1", "https://example.com/"),
    "https://example.com/new",
  );
  clearPinnedSiteOpenUrl("pin-1", "https://example.com/new");
  assert.equal(
    consumePinnedSiteOpenUrl("pin-1", "https://example.com/"),
    "https://example.com/",
  );
});

test("clear without appliedUrl drops pending unconditionally", () => {
  resetPendingPinnedSiteOpenForTests();
  queuePinnedSiteOpenUrl("pin-1", "https://example.com/deep");
  clearPinnedSiteOpenUrl("pin-1");
  assert.equal(
    consumePinnedSiteOpenUrl("pin-1", "https://example.com/"),
    "https://example.com/",
  );
});

test("subscribe notifies already-mounted pin screens of deep links", () => {
  resetPendingPinnedSiteOpenForTests();
  const seen = [];
  const stop = subscribePinnedSiteOpenUrl((pinId, url) => {
    seen.push({ pinId, url });
  });
  queuePinnedSiteOpenUrl("pin-2", "https://docs.example.com/guide/intro");
  assert.deepEqual(seen, [
    { pinId: "pin-2", url: "https://docs.example.com/guide/intro" },
  ]);
  stop();
  queuePinnedSiteOpenUrl("pin-2", "https://docs.example.com/other");
  assert.equal(seen.length, 1);
  resetPendingPinnedSiteOpenForTests();
});

test("left-click path passes full URL through queue until surface clear", () => {
  resetPendingPinnedSiteOpenForTests();
  const fullHref = "https://example.com/docs/guide#section";
  // ExternalLinkAnchor openInPinnedWebsite(fullHref)
  queuePinnedSiteOpenUrl("pin-wayfinder", fullHref);
  // PinnedSiteScreen layout / useState peek (may run twice under Strict Mode)
  assert.equal(
    consumePinnedSiteOpenUrl("pin-wayfinder", "https://example.com/"),
    fullHref,
  );
  assert.equal(
    consumePinnedSiteOpenUrl("pin-wayfinder", "https://example.com/"),
    fullHref,
  );
  // Surface applied showPinWebview(fullHref)
  clearPinnedSiteOpenUrl("pin-wayfinder", fullHref);
  assert.equal(
    consumePinnedSiteOpenUrl("pin-wayfinder", "https://example.com/"),
    "https://example.com/",
  );
});
