import assert from "node:assert/strict";
import test from "node:test";

import {
  canSeeCommunityAgentsSettings,
  COMMUNITY_AGENTS_ARCHIVE_SECTION,
  isAdminOnlySettingsSection,
} from "./settingsVisibility.ts";

test("Bots and Invites are owner/admin-only settings sections", () => {
  assert.equal(isAdminOnlySettingsSection("bots"), true);
  assert.equal(isAdminOnlySettingsSection("community-members"), true);
  assert.equal(isAdminOnlySettingsSection("hosted-communities"), false);
  assert.equal(isAdminOnlySettingsSection("agents"), false);
});

test("community agents archive list is owner/admin-only like Bots", () => {
  assert.equal(COMMUNITY_AGENTS_ARCHIVE_SECTION, "bots");
  assert.equal(
    isAdminOnlySettingsSection(COMMUNITY_AGENTS_ARCHIVE_SECTION),
    true,
  );
  assert.equal(canSeeCommunityAgentsSettings("owner"), true);
  assert.equal(canSeeCommunityAgentsSettings("admin"), true);
  assert.equal(canSeeCommunityAgentsSettings("member"), false);
  assert.equal(canSeeCommunityAgentsSettings("guest"), false);
  assert.equal(canSeeCommunityAgentsSettings(null), false);
  assert.equal(canSeeCommunityAgentsSettings(undefined), false);
});
