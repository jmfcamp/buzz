import * as React from "react";

import { useAppShell } from "@/app/AppShellContext";
import { useChannelsQuery } from "@/features/channels/hooks";
import { useHomeFeedQuery } from "@/features/home/hooks";
import { buildInboxItems } from "@/features/home/lib/inbox";
import {
  deriveSidebarInboxUnreadCount,
  projectInboxEffectiveDoneSet,
} from "@/features/home/lib/inboxUnreadCount";
import { filterInboxItems } from "@/features/home/lib/inboxViewHelpers";
import { useOwnedAgentPubkeys } from "@/features/home/useOwnedAgentPubkeys";
import { useIdentityQuery } from "@/shared/api/hooks";

/**
 * Inbox left-nav unread: same source as InboxListPane's Mark-all-read numeral
 * (default "all" filter rows not in the effective done set). Does **not** use
 * `homeBadgeCount`, which only counts mentions/needsAction and is zeroed by
 * `homeBadgeEnabled` / seen-feed marking after visiting Home.
 */
export function useSidebarInboxUnreadCount(): number | undefined {
  const identityQuery = useIdentityQuery();
  const homeFeedQuery = useHomeFeedQuery();
  const channelsQuery = useChannelsQuery();
  const {
    feedItemState,
    getChannelReadAt,
    getMessageReadAt,
    getThreadReadAt,
    readStateVersion,
  } = useAppShell();
  const ownedAgentPubkeys = useOwnedAgentPubkeys(
    true,
    undefined,
    identityQuery.data?.pubkey,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: readStateVersion invalidates read lookups
  return React.useMemo(() => {
    if (homeFeedQuery.data === undefined) return undefined;

    const items = filterInboxItems(
      buildInboxItems({
        channels: channelsQuery.data,
        currentPubkey: identityQuery.data?.pubkey,
        feed: homeFeedQuery.data,
        getChannelReadAt,
        getMessageReadAt,
        getThreadReadAt,
      }),
    );
    const doneSet = projectInboxEffectiveDoneSet(items, {
      getChannelReadAt,
      getMessageReadAt,
      getThreadReadAt,
      localDoneSet: feedItemState.doneSet,
      localUnreadSet: feedItemState.unreadSet,
    });
    return deriveSidebarInboxUnreadCount({
      items,
      doneSet,
      ownedAgentPubkeys,
    });
  }, [
    channelsQuery.data,
    feedItemState.doneSet,
    feedItemState.unreadSet,
    getChannelReadAt,
    getMessageReadAt,
    getThreadReadAt,
    homeFeedQuery.data,
    identityQuery.data?.pubkey,
    ownedAgentPubkeys,
    readStateVersion,
  ]);
}
