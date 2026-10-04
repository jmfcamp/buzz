import * as React from "react";

import {
  useManagedAgentsQuery,
  useRelayAgentsQuery,
} from "@/features/agents/hooks";
import { loadLocalCommunityBots } from "@/features/community-bots/lib/catalog";
import { useCommunityBotsQuery } from "@/features/community-bots/hooks";
import { useRelayMembersQuery } from "@/features/community-members/hooks";
import { useCommunities } from "@/features/communities/useCommunities";
import {
  communityBotPubkeySet,
  humanRelayDriCandidates,
} from "@/features/projects/lib/projectDri";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import { resolveUserLabel } from "@/features/profile/lib/identity";
import { normalizePubkey } from "@/shared/lib/pubkey";

export type HumanRelayDriOption = {
  avatarUrl: string | null;
  label: string;
  pubkey: string;
};

/**
 * Real relay members only. Local agents, relay agents, community bots,
 * NIP-OA agent profiles, and keys whose profile has not settled are left out.
 */
export function useHumanRelayDriOptions() {
  const { activeCommunity } = useCommunities();
  const relayUrl = activeCommunity?.relayUrl ?? "";
  const membersQuery = useRelayMembersQuery();
  const managedQuery = useManagedAgentsQuery();
  const relayAgentsQuery = useRelayAgentsQuery();
  const botsQuery = useCommunityBotsQuery();
  const memberPubkeys = (membersQuery.data ?? []).map(
    (member) => member.pubkey,
  );
  const profilesQuery = useUsersBatchQuery(memberPubkeys, {
    enabled: membersQuery.isSuccess && memberPubkeys.length > 0,
  });
  // The catalog query merges kind 30624 over this device's copy by bot id.
  // A relay row with a different pubkey would hide the member key. Keep both.
  const localBots = React.useMemo(
    () => (relayUrl ? loadLocalCommunityBots(relayUrl) : []),
    [relayUrl],
  );
  const communityBotPubkeys = React.useMemo(
    () => communityBotPubkeySet([...(botsQuery.data ?? []), ...localBots]),
    [botsQuery.data, localBots],
  );
  const excludedPubkeys = React.useMemo(() => {
    const pubkeys = new Set<string>();
    for (const agent of managedQuery.data ?? []) {
      const pubkey = normalizePubkey(agent.pubkey);
      if (/^[0-9a-f]{64}$/.test(pubkey)) pubkeys.add(pubkey);
    }
    for (const agent of relayAgentsQuery.data ?? []) {
      const pubkey = normalizePubkey(agent.pubkey);
      if (/^[0-9a-f]{64}$/.test(pubkey)) pubkeys.add(pubkey);
    }
    for (const pubkey of communityBotPubkeys) pubkeys.add(pubkey);
    return pubkeys;
  }, [communityBotPubkeys, managedQuery.data, relayAgentsQuery.data]);
  const sourcesReady =
    membersQuery.isSuccess &&
    managedQuery.isSuccess &&
    relayAgentsQuery.isSuccess &&
    botsQuery.isSuccess &&
    (memberPubkeys.length === 0 || profilesQuery.isSuccess);
  const failed =
    membersQuery.isError ||
    managedQuery.isError ||
    relayAgentsQuery.isError ||
    botsQuery.isError ||
    (memberPubkeys.length > 0 && profilesQuery.isError);
  const candidates = React.useMemo(
    () =>
      humanRelayDriCandidates({
        communityBotPubkeys,
        excludedPubkeys,
        members: membersQuery.data ?? [],
        profiles: profilesQuery.data?.profiles ?? {},
        sourcesReady: sourcesReady && !failed,
      }),
    [
      communityBotPubkeys,
      excludedPubkeys,
      failed,
      membersQuery.data,
      profilesQuery.data?.profiles,
      sourcesReady,
    ],
  );
  const options = React.useMemo<HumanRelayDriOption[]>(
    () =>
      candidates
        .map((candidate) => ({
          avatarUrl: candidate.profile.avatarUrl ?? null,
          pubkey: candidate.pubkey,
          label: resolveUserLabel({
            preferResolvedSelfLabel: true,
            profiles: {
              [candidate.pubkey]: {
                avatarUrl: candidate.profile.avatarUrl ?? null,
                displayName: candidate.profile.displayName ?? null,
                isAgent: candidate.profile.isAgent,
                nip05Handle: candidate.profile.nip05Handle ?? null,
                ownerPubkey: candidate.profile.ownerPubkey ?? null,
              },
            },
            pubkey: candidate.pubkey,
          }),
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [candidates],
  );

  return {
    failed,
    options,
    ready: sourcesReady && !failed,
  };
}
