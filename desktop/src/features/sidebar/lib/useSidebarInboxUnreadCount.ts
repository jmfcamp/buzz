import { useAssistantDueReminderCount } from "@/features/assistantLists/listsStore";
import * as React from "react";

import { useAppShell } from "@/app/AppShellContext";
import { markHiddenDmFeedItems } from "@/features/channels/dmResurface";
import { useChannelsQuery } from "@/features/channels/hooks";
import { useHiddenDmIds } from "@/features/channels/useHiddenDmIds";
import { useHomeFeedQuery } from "@/features/home/hooks";
import { buildInboxItems } from "@/features/home/lib/inbox";
import {
  computeInboxTabCounts,
  inboxFeedAuthorPubkeys,
  type InboxTabCounts,
  useCountAgentInfoItems,
} from "@/features/home/lib/inboxTabs";
import { projectInboxEffectiveDoneSet } from "@/features/home/lib/inboxUnreadCount";
import { useAssistantPubkey } from "@/shared/lib/assistantIdentity";
import { useDueReminderBadgeCount } from "@/features/reminders/hooks";
import { filterInboxItems } from "@/features/home/lib/inboxViewHelpers";
import { useOwnedAgentPubkeys } from "@/features/home/useOwnedAgentPubkeys";
import type { HomeFeedResponse } from "@/shared/api/types";
import { useIdentityQuery } from "@/shared/api/hooks";
import { useUsersBatchQuery } from "@/features/profile/hooks";

/**
 * Inbox left-nav unread: same source as InboxListPane's Mark-all-read numeral
 * (default "all" filter rows not in the effective done set). Does **not** use
 * `homeBadgeCount`, which only counts mentions/needsAction and is zeroed by
 * `homeBadgeEnabled` / seen-feed marking after visiting Home.
 *
 * Folds `threadActivityFeedItems` and `markHiddenDmFeedItems` the same way
 * HomeScreen does so live non-mention thread replies and hidden DMs update
 * the badge to the same unread set Inbox shows.
 */
export function useSidebarInboxUnreadCount(): number | undefined {
  return useInboxTabCounts()?.total;
}

/** Per-tab Inbox counts (Inbox / Agents / Reminders) and their total. */
export function useInboxTabCounts(): InboxTabCounts | undefined {
  const identityQuery = useIdentityQuery();
  const homeFeedQuery = useHomeFeedQuery();
  const channelsQuery = useChannelsQuery();
  const {
    feedItemState,
    getChannelReadAt,
    getMessageReadAt,
    getThreadReadAt,
    readStateVersion,
    isReadStateReady,
    threadActivityFeedItems,
  } = useAppShell();

  const hiddenDmIds = useHiddenDmIds(identityQuery.data?.pubkey);
  const [countAgentInfoItems] = useCountAgentInfoItems();
  const assistantPubkey = useAssistantPubkey();
  const assistantDueCount = useAssistantDueReminderCount(
    identityQuery.data?.pubkey,
  );
  // The Assistant's due reminders come from its lists doc (shown in the Reminders tab's Assistant section), so their
  // dual-written NIP-ER copies (hidden from the message list) are not counted a second time. Same on web and desktop.
  const dueReminderCount =
    useDueReminderBadgeCount(identityQuery.data?.pubkey, true) +
    assistantDueCount;

  // Same augmentation as HomeScreen: live thread activity + hidden-DM typing
  // so the badge matches InboxListPane unread under the default All filter.
  const feed = React.useMemo((): HomeFeedResponse | undefined => {
    if (homeFeedQuery.data === undefined) return undefined;
    const withThreadActivity =
      threadActivityFeedItems.length === 0
        ? homeFeedQuery.data
        : {
            ...homeFeedQuery.data,
            feed: {
              ...homeFeedQuery.data.feed,
              activity: [
                ...homeFeedQuery.data.feed.activity,
                ...threadActivityFeedItems,
              ],
            },
          };
    return markHiddenDmFeedItems(withThreadActivity, hiddenDmIds);
  }, [hiddenDmIds, homeFeedQuery.data, threadActivityFeedItems]);

  // Same owned-agent set as the Inbox list: managed agents plus any feed
  // author whose profile names you as owner. Without the profiles, a reply
  // from your own agent counted on People while the list filed it under Agents.
  const feedAuthorPubkeys = React.useMemo(
    () => inboxFeedAuthorPubkeys(feed, identityQuery.data?.pubkey),
    [feed, identityQuery.data?.pubkey],
  );
  const feedProfilesQuery = useUsersBatchQuery(feedAuthorPubkeys, {
    enabled: feedAuthorPubkeys.length > 0,
  });
  const feedProfiles = feedProfilesQuery.data?.profiles;
  const profilesPending =
    feedAuthorPubkeys.length > 0 && feedProfilesQuery.data === undefined;
  const ownedAgentPubkeys = useOwnedAgentPubkeys(
    true,
    feedProfiles,
    identityQuery.data?.pubkey,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: readStateVersion invalidates read lookups
  return React.useMemo(() => {
    // Synced read markers must load first, or a fresh install counts everything (99+).
    if (feed === undefined || !isReadStateReady) return undefined;
    // Wait for author profiles so owned agents are not briefly counted as People.
    if (profilesPending && !feedProfilesQuery.isError) return undefined;

    const items = filterInboxItems(
      buildInboxItems({
        channels: channelsQuery.data,
        currentPubkey: identityQuery.data?.pubkey,
        feed,
        getChannelReadAt,
        getMessageReadAt,
        getThreadReadAt,
        profiles: feedProfiles,
      }),
    );
    const doneSet = projectInboxEffectiveDoneSet(items, {
      getChannelReadAt,
      getMessageReadAt,
      getThreadReadAt,
      localDoneSet: feedItemState.doneSet,
      localUnreadSet: feedItemState.unreadSet,
    });
    return computeInboxTabCounts({
      items,
      doneSet,
      ownedAgentPubkeys,
      dueReminderCount,
      countAgentInfoItems,
      assistantPubkey,
    });
  }, [
    assistantPubkey,
    countAgentInfoItems,
    dueReminderCount,
    channelsQuery.data,
    feed,
    feedItemState.doneSet,
    feedItemState.unreadSet,
    feedProfiles,
    feedProfilesQuery.isError,
    profilesPending,
    getChannelReadAt,
    getMessageReadAt,
    getThreadReadAt,
    identityQuery.data?.pubkey,
    isReadStateReady,
    ownedAgentPubkeys,
    readStateVersion,
  ]);
}
