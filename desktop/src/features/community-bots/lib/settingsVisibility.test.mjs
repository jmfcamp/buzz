import assert from "node:assert/strict";
import test from "node:test";

import { isAdminOnlySettingsSection } from "./settingsVisibility.ts";

test("Bots and Invites are owner/admin-only settings sections", () => {
  assert.equal(isAdminOnlySettingsSection("bots"), true);
  assert.equal(isAdminOnlySettingsSection("community-members"), true);
  assert.equal(isAdminOnlySettingsSection("hosted-communities"), false);
  assert.equal(isAdminOnlySettingsSection("agents"), false);
});
