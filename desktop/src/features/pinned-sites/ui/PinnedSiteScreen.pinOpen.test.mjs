import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

test("PinnedSiteScreen keeps deep startUrl after pending clear (no home clobber)", () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(dir, "PinnedSiteScreen.tsx"), "utf8");
  assert.match(
    source,
    /Never fall back to pin\.url on every layout pass/,
  );
  assert.match(
    source,
    /setStartUrl\(\(prev\) => prev \|\| pin\.url\)/,
  );
  assert.match(
    source,
    /goPinnedSite|navOpenUrl|pinnedSiteOpenUrl/,
  );
  assert.match(
    source,
    /clearPinnedSiteOpenUrl\(id, appliedUrl\)/,
  );
});
