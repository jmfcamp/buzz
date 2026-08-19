export const ADMIN_ONLY_SETTINGS_SECTIONS = [
  "community-members",
  "bots",
] as const;

export function isAdminOnlySettingsSection(value: string): boolean {
  return (ADMIN_ONLY_SETTINGS_SECTIONS as readonly string[]).includes(value);
}
