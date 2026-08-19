import assert from "node:assert/strict";
import test from "node:test";

import { normalizePinnedSiteName, normalizePinnedSiteUrl } from "./url.ts";

test("normalizePinnedSiteUrl requires https and fills a missing scheme", () => {
  assert.equal(
    normalizePinnedSiteUrl("wayfinder.huladesk.com"),
    "https://wayfinder.huladesk.com/",
  );
  assert.equal(normalizePinnedSiteUrl("http://example.com"), null);
  assert.equal(normalizePinnedSiteUrl("javascript:alert(1)"), null);
});

test("normalizePinnedSiteName trims and rejects empty names", () => {
  assert.equal(normalizePinnedSiteName("  Docs  "), "Docs");
  assert.equal(normalizePinnedSiteName("   "), null);
});
