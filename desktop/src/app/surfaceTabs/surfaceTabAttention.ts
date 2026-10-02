import type { SurfaceTabTarget } from "@/app/surfaceTabs/surfaceTabModel";
import { surfaceTabFullLabel } from "@/app/surfaceTabs/surfaceTabModel";
import {
  resolveSidebarMenuCount,
  type SidebarMenuCounts,
  shouldShowSidebarMenuCount,
} from "@/features/sidebar/lib/sidebarMenuCounts";
import type { SidebarMenuCountPreferences } from "@/features/sidebar/lib/sidebarMenuCountsPreference";
import {
  countUnreadForStarredThreadRoot,
  formatSidebarUnreadCount,
} from "@/features/sidebar/lib/starredThreadSidebar";

/** Bold name and count chip a top tab copies from its left-panel row. */
export type SurfaceTabMark = {
  bold: boolean;
  countLabel: string | null;
};

export type SurfaceTabThreadItem = {
  id: string;
  tags: string[][];
  channelId?: string | null;
};

export type SurfaceTabAttentionInput = {
  target: SurfaceTabTarget;
  menuCounts: SidebarMenuCounts;
  menuPreferences: SidebarMenuCountPreferences;
  unreadChannelIds: ReadonlySet<string>;
  unreadChannelCounts: ReadonlyMap<string, number>;
  dmChannelIds: ReadonlySet<string>;
  unreadThreadChannelIds: ReadonlySet<string>;
  unreadThreadFeedItems: readonly SurfaceTabThreadItem[];
  hasSidebarUnreadProjections: boolean;
};

const QUIET: SurfaceTabMark = { bold: false, countLabel: null };

function menuCountLabel(
  count: number | string | undefined,
  preferenceEnabled: boolean,
  legacyWhenPositive: boolean,
): string | null {
  if (
    !shouldShowSidebarMenuCount({
      preferenceEnabled,
      count,
      legacyWhenPositive,
    })
  ) {
    return null;
  }
  if (typeof count === "string") return count;
  const resolved = resolveSidebarMenuCount(count);
  return resolved === undefined ? null : String(resolved);
}

function threadFeedCountForChannel(
  items: readonly SurfaceTabThreadItem[],
  channelId: string,
): number {
  let count = 0;
  for (const item of items) {
    if (item.channelId === channelId) count += 1;
  }
  return count;
}

function channelMark(
  channelId: string,
  input: SurfaceTabAttentionInput,
): SurfaceTabMark {
  const isDm = input.dmChannelIds.has(channelId);
  const hasUnread = input.unreadChannelIds.has(channelId);
  const hasThreadUnread =
    !isDm &&
    (input.hasSidebarUnreadProjections
      ? input.unreadThreadChannelIds.has(channelId)
      : hasUnread);
  const bold = hasUnread || hasThreadUnread;
  const unreadCount = input.unreadChannelCounts.get(channelId) ?? 0;
  const threadCount = isDm
    ? 0
    : threadFeedCountForChannel(input.unreadThreadFeedItems, channelId);
  const badgeCount = Math.max(
    unreadCount,
    threadCount,
    hasThreadUnread ? 1 : 0,
  );
  return {
    bold,
    countLabel:
      !isDm && badgeCount > 0 ? formatSidebarUnreadCount(badgeCount) : null,
  };
}

/**
 * The mark the left panel would show for this surface.
 * Primary rows contribute a count chip. Channel and thread rows also go bold
 * when they have unread work. Direct messages go bold and keep the count off.
 */
export function surfaceTabMark(
  input: SurfaceTabAttentionInput,
): SurfaceTabMark {
  const { target, menuCounts, menuPreferences } = input;
  switch (target.kind) {
    case "home":
      return {
        bold: false,
        countLabel: menuCountLabel(
          menuCounts.inbox,
          menuPreferences.inbox,
          true,
        ),
      };
    case "agents":
      return {
        bold: false,
        countLabel: menuCountLabel(
          menuCounts.agents,
          menuPreferences.agents,
          false,
        ),
      };
    case "bots":
      return {
        bold: false,
        countLabel: menuCountLabel(
          menuCounts.bots,
          menuPreferences.bots,
          false,
        ),
      };
    case "browsers":
      return {
        bold: false,
        countLabel: menuCountLabel(
          menuCounts.browsers,
          menuPreferences.browsers,
          true,
        ),
      };
    case "channel":
      return channelMark(target.channelId, input);
    case "thread": {
      const count = countUnreadForStarredThreadRoot(
        input.unreadThreadFeedItems,
        target.rootId,
      );
      return {
        bold: count > 0,
        countLabel: count > 0 ? formatSidebarUnreadCount(count) : null,
      };
    }
    default:
      return QUIET;
  }
}

/**
 * Accessible name for a tab. The working phrase is the agent status
 * ("Ada working"). The ticking clock stays visual.
 */
export function surfaceTabAccessibleName(
  label: string,
  mark: SurfaceTabMark,
  workingLabel?: string | null,
): string {
  const parts = [surfaceTabFullLabel(label)];
  const status = workingLabel?.trim();
  if (status) parts.push(status);
  if (mark.countLabel && mark.bold) parts.push(`${mark.countLabel} unread`);
  else if (mark.countLabel) parts.push(mark.countLabel);
  else if (mark.bold) parts.push("unread");
  return parts.join(", ");
}
