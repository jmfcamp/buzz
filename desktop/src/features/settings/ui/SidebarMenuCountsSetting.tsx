import {
  setSidebarMenuCountsEnabled,
  useSidebarMenuCountsEnabled,
} from "@/features/sidebar/lib/sidebarMenuCountsPreference";
import { Switch } from "@/shared/ui/switch";

import { SettingsOptionRow } from "./SettingsOptionGroup";

/** Appearance toggle for numeric counts on primary left-nav items. */
export function SidebarMenuCountsSetting() {
  const enabled = useSidebarMenuCountsEnabled();

  return (
    <SettingsOptionRow data-testid="sidebar-menu-counts-row">
      <div className="min-w-0">
        <label
          className="text-sm font-medium"
          htmlFor="sidebar-menu-counts-switch"
        >
          Show counts on menu items
        </label>
        <p
          className="text-sm font-normal text-muted-foreground/70"
          data-settings-subcopy
        >
          Show Inbox unread, Browsers and Bots totals, and Agents as
          running/total in the sidebar.
        </p>
      </div>
      <Switch
        checked={enabled}
        data-testid="sidebar-menu-counts-toggle"
        id="sidebar-menu-counts-switch"
        onCheckedChange={setSidebarMenuCountsEnabled}
      />
    </SettingsOptionRow>
  );
}
