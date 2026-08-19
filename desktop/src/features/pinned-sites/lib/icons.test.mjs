import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PINNED_SITE_ICONS,
  getPinnedSiteIcon,
  isPinnedSiteIconId,
} from "./icons.ts";

function isRenderableIcon(value) {
  return (
    typeof value === "function" || (typeof value === "object" && value !== null)
  );
}

test("every pinned-site icon id maps to a renderable component", () => {
  assert.ok(PINNED_SITE_ICONS.length > 0);
  for (const entry of PINNED_SITE_ICONS) {
    assert.ok(
      isRenderableIcon(entry.Icon),
      `${entry.id} must be a Lucide component`,
    );
    assert.equal(getPinnedSiteIcon(entry.id), entry.Icon);
    assert.equal(isPinnedSiteIconId(entry.id), true);
  }
});

test("getPinnedSiteIcon falls back when the id is missing", () => {
  const fallback = getPinnedSiteIcon("not-an-icon");
  assert.ok(isRenderableIcon(fallback));
  assert.equal(fallback, getPinnedSiteIcon("compass"));
});
