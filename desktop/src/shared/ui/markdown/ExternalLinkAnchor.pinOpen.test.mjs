import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Left-click and context-menu "Open in Pinned Website" must share the exact
 * openInPinnedWebsite(fullHref) path: queue + goPinnedSite(..., { openUrl }).
 */
test("left-click openDefault uses openInPinnedWebsite with full href openUrl", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(dir, "ExternalLinkAnchor.tsx"), "utf8");

  assert.match(
    source,
    /queuePinnedSiteOpenUrl\(matchedPin\.id, href\)/,
    "queues the clicked href",
  );
  assert.match(
    source,
    /goPinnedSite\(matchedPin\.id, undefined, \{\s*openUrl:\s*href\s*\}\)/,
    "passes full href as openUrl to goPinnedSite",
  );
  assert.match(
    source,
    /const openDefault = React\.useCallback\(\(\) => \{[\s\S]*openInPinnedWebsite\(\);/,
    "left-click openDefault calls openInPinnedWebsite",
  );
  assert.match(
    source,
    /label:\s*"Open in Pinned Website"[\s\S]*openInPinnedWebsite\(\)/,
    "context menu uses the same openInPinnedWebsite",
  );
  // Left-click must not bypass pin open for a matched pin.
  assert.doesNotMatch(
    source,
    /onClick=\{[\s\S]*openInSidePanel\(\);/,
    "onClick must not call openInSidePanel directly",
  );
});
