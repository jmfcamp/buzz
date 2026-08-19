import * as React from "react";
import { useQueries } from "@tanstack/react-query";

import { useChannelsQuery } from "@/features/channels/hooks";
import { useCommunityBotsQuery } from "@/features/community-bots/hooks";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import { getChannelMembers } from "@/shared/api/tauri";
import type { ChannelMember } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

import {
  collectCommunityAgents,
  isLeftoverCommunityAgentMember,
  type CommunityAgentListItem,
} from "./communityAgents";
import { useArchivedIdentitiesQuery } from "./hooks";

function channelMembersQueryKey(channelId: string) {
  return ["channels", channelId, "members"] as const;
}

/**
 * Catalog bots plus leftover agent/bot-role members across community
 * channels. People are excluded. Used by the Communities archive list.
 */
export function useCommunityAgentsForArchive(): {
  agents: CommunityAgentListItem[];
  isLoading: boolean;
} {
  const catalogQuery = useCommunityBotsQuery();
  const channelsQuery = useChannelsQuery();
  const archiveQuery = useArchivedIdentitiesQuery();

  const channelIds = React.useMemo(
    () =>
      (channelsQuery.data ?? [])
        .filter((channel) => channel.channelType !== "dm")
        .map((channel) => channel.id),
    [channelsQuery.data],
  );

  const memberQueries = useQueries({
    queries: channelIds.map((channelId) => ({
      queryKey: channelMembersQueryKey(channelId),
      queryFn: () => getChannelMembers(channelId),
      staleTime: 30_000,
    })),
  });

  const leftoverMembers = React.useMemo(() => {
    const byPubkey = new Map<string, ChannelMember>();
    for (const query of memberQueries) {
      for (const member of query.data ?? []) {
        if (!isLeftoverCommunityAgentMember(member)) continue;
        const pubkey = normalizePubkey(member.pubkey);
        if (!byPubkey.has(pubkey)) {
          byPubkey.set(pubkey, { ...member, pubkey });
        }
      }
    }
    return [...byPubkey.values()];
  }, [memberQueries]);

  const profilePubkeys = React.useMemo(() => {
    const pubkeys = new Set<string>();
    for (const bot of catalogQuery.data ?? []) {
      pubkeys.add(normalizePubkey(bot.pubkey));
    }
    for (const member of leftoverMembers) {
      pubkeys.add(normalizePubkey(member.pubkey));
    }
    return [...pubkeys];
  }, [catalogQuery.data, leftoverMembers]);

  const profilesQuery = useUsersBatchQuery(profilePubkeys, {
    enabled: profilePubkeys.length > 0,
  });

  const agents = React.useMemo(
    () =>
      collectCommunityAgents({
        catalogBots: catalogQuery.data ?? [],
        leftoverMembers,
        archivedPubkeys: archiveQuery.data?.archived ?? [],
        profiles: profilesQuery.data?.profiles,
      }),
    [
      archiveQuery.data?.archived,
      catalogQuery.data,
      leftoverMembers,
      profilesQuery.data?.profiles,
    ],
  );

  const membersLoading = memberQueries.some(
    (query) => query.isLoading && query.data === undefined,
  );

  return {
    agents,
    isLoading:
      catalogQuery.isLoading ||
      channelsQuery.isLoading ||
      membersLoading ||
      (archiveQuery.isLoading && archiveQuery.data === undefined),
  };
}
