import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { INBOX_WINDOW_SECONDS } from "@/features/channels/readState/readStateFormat";
import { buildChannelSubscriptionItems } from "@/features/home/lib/channelSubscriptionInbox";
import { NOTIFY_MESSAGE_KINDS } from "@/features/home/lib/notificationInbox";
import { relayClient } from "@/shared/api/relayClient";
import type { Channel, FeedItem, RelayEvent } from "@/shared/api/types";
import { useRelayConnection } from "@/shared/api/useRelayConnection";
import { useFocusedRefetchInterval } from "@/shared/lib/useDocumentVisible";

const MAX_CHANNELS = 50;

/** New top-level posts in channels set to "All messages". */
export function useChannelSubscriptionFeedItems({
  pubkey,
  channels,
  allChannelIds,
  mutedChannelIds,
  enabled,
}: {
  pubkey: string | undefined;
  channels: Channel[];
  allChannelIds: ReadonlySet<string>;
  mutedChannelIds: ReadonlySet<string>;
  enabled: boolean;
}): FeedItem[] {
  const me = pubkey?.trim().toLowerCase() ?? "";
  const connected = useRelayConnection() === "connected";
  const refetchInterval = useFocusedRefetchInterval(connected ? 45_000 : false);
  const ids = React.useMemo(
    () => [...allChannelIds].sort().slice(0, MAX_CHANNELS),
    [allChannelIds],
  );
  const query = useQuery({
    queryKey: ["channel-subscription-inbox", me, ids.join(",")],
    enabled: enabled && me.length > 0 && connected && ids.length > 0,
    refetchInterval,
    staleTime: 20_000,
    gcTime: 5 * 60_000,
    queryFn: async (): Promise<RelayEvent[]> =>
      relayClient
        .fetchEvents({
          kinds: NOTIFY_MESSAGE_KINDS,
          "#h": ids,
          since: Math.floor(Date.now() / 1000) - INBOX_WINDOW_SECONDS,
          limit: 200,
        })
        .catch(() => [] as RelayEvent[]),
  });
  return React.useMemo(
    () =>
      enabled && query.data && ids.length > 0
        ? buildChannelSubscriptionItems(query.data, {
            me,
            channels,
            allChannelIds,
            mutedChannelIds,
          })
        : [],
    [allChannelIds, channels, enabled, ids.length, me, mutedChannelIds, query.data],
  );
}
