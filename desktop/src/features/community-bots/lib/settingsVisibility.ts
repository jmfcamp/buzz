export const ADMIN_ONLY_SETTINGS_SECTIONS = [
  "community-members",
  "bots",
] as const;

/** Community agents archive list is rendered on the Bots settings page. */
export const COMMUNITY_AGENTS_ARCHIVE_SECTION = "bots" as const;

export function isAdminOnlySettingsSection(value: string): boolean {
  return (ADMIN_ONLY_SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/** Same owner/admin gate as Bots. Regular members and open relays do not see it. */
export function canSeeCommunityAgentsSettings(
  role: string | null | undefined,
): boolean {
  return (
    isAdminOnlySettingsSection(COMMUNITY_AGENTS_ARCHIVE_SECTION) &&
    (role === "owner" || role === "admin")
  );
}
