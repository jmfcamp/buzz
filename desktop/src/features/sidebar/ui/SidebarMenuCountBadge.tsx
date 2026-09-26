import { SidebarMenuBadge } from "@/shared/ui/sidebar";

import {
  resolveSidebarMenuCount,
  shouldShowSidebarMenuCount,
} from "@/features/sidebar/lib/sidebarMenuCounts";

const MENU_COUNT_BADGE_CLASS =
  "right-2 rounded-full bg-primary/15 px-1.5 text-2xs text-primary peer-data-[active=true]/menu-button:bg-sidebar-active-foreground/20 peer-data-[active=true]/menu-button:text-sidebar-active-foreground";

export type SidebarMenuCountBadgeProps = {
  /** Numeric count, or a preformatted string (e.g. Agents `3/12`). */
  count: number | string | undefined | null;
  preferenceEnabled: boolean;
  /** Keep the legacy Inbox unread chip when preference is off and count > 0. */
  legacyWhenPositive?: boolean;
  testId: string;
};

/** Compact count chip beside a primary left-nav label. */
export function SidebarMenuCountBadge({
  count,
  preferenceEnabled,
  legacyWhenPositive = false,
  testId,
}: SidebarMenuCountBadgeProps) {
  if (
    !shouldShowSidebarMenuCount({
      preferenceEnabled,
      count,
      legacyWhenPositive,
    })
  ) {
    return null;
  }
  const label =
    typeof count === "string" ? count : resolveSidebarMenuCount(count);
  if (label === undefined || label === "") return null;
  return (
    <SidebarMenuBadge className={MENU_COUNT_BADGE_CLASS} data-testid={testId}>
      {label}
    </SidebarMenuBadge>
  );
}
