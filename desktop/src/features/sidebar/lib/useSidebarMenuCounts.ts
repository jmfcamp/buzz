import * as React from "react";

import { useManagedAgentsQuery } from "@/features/agents/hooks";
import { isManagedAgentActive } from "@/features/agents/lib/managedAgentControlActions";
import { useCommunityBotsQuery } from "@/features/community-bots/hooks";
import { visibleCommunityDirectoryBots } from "@/features/community-bots/lib/directory";
import { useIsArchivedPredicate } from "@/features/identity-archive/hooks";
import { usePlaygroundSessions } from "@/features/playground/hooks";

import {
  deriveSidebarMenuCounts,
  type SidebarMenuCounts,
} from "./sidebarMenuCounts";
import { useSidebarInboxUnreadCount } from "./useSidebarInboxUnreadCount";
import { useSidebarMenuCountsEnabled } from "./sidebarMenuCountsPreference";

export type SidebarMenuCountsState = {
  preferenceEnabled: boolean;
  counts: SidebarMenuCounts;
};

/**
 * Live counts for the primary left-nav.
 * Inbox unread matches InboxListPane (not homeBadgeCount).
 * Browsers = playground sessions; Agents = running/total managed roster;
 * Bots = visible community directory bots.
 */
export function useSidebarMenuCounts(): SidebarMenuCountsState {
  const preferenceEnabled = useSidebarMenuCountsEnabled();
  const inboxUnread = useSidebarInboxUnreadCount();
  const playground = usePlaygroundSessions();
  const managedAgentsQuery = useManagedAgentsQuery();
  const communityBotsQuery = useCommunityBotsQuery();
  const isArchived = useIsArchivedPredicate();

  const browserSessionCount = playground.sessions.size;
  const agentTotalCount =
    managedAgentsQuery.data === undefined
      ? undefined
      : managedAgentsQuery.data.length;
  const agentRunningCount = React.useMemo(() => {
    if (managedAgentsQuery.data === undefined) return undefined;
    return managedAgentsQuery.data.filter((agent) =>
      isManagedAgentActive(agent),
    ).length;
  }, [managedAgentsQuery.data]);
  const botCount = React.useMemo(() => {
    if (communityBotsQuery.data === undefined) return undefined;
    return visibleCommunityDirectoryBots(communityBotsQuery.data, isArchived)
      .length;
  }, [communityBotsQuery.data, isArchived]);

  const counts = React.useMemo(
    () =>
      deriveSidebarMenuCounts({
        inboxUnread,
        browserSessionCount,
        agentRunningCount,
        agentTotalCount,
        botCount,
      }),
    [
      agentRunningCount,
      agentTotalCount,
      botCount,
      browserSessionCount,
      inboxUnread,
    ],
  );

  return { preferenceEnabled, counts };
}
