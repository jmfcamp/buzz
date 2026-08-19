import {
  filterAdmittedMentionPubkeys,
  getAgentMentionAdmission,
  getDirectoryGatedAgentPubkeys,
  getMentionableAgentPubkeys,
  type AgentEligibilityScope,
} from "@/features/agents/lib/agentAutocompleteEligibility";
import { evictUsersBatchEntries } from "@/features/profile/hooks";
import { getUsersBatch } from "@/shared/api/tauriProfiles";
import { revalidateRelayAgents } from "@/shared/api/tauriRelayAgents";
import type {
  ManagedAgent,
  RelayAgent,
  UsersBatchResponse,
} from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

type DirectoryResult<T> = {
  data: T | undefined;
  error: Error | null;
};

export async function revalidateAgentMentionPubkeys({
  pubkeys,
  agentPubkeys,
  currentPubkey,
  eligibilityScope,
  sharedChannelIds,
  ownerOnly,
  ownerPolicyError,
  refetchManagedAgents,
  fetchRelayAgents,
  refetchOwnerProfiles,
  memberPubkeys,
  knownManagedAgentPubkeys,
  knownRelayAgents,
}: {
  pubkeys: readonly string[];
  agentPubkeys: ReadonlySet<string>;
  currentPubkey: string | null;
  eligibilityScope: AgentEligibilityScope;
  sharedChannelIds: ReadonlySet<string>;
  ownerOnly: boolean | undefined;
  ownerPolicyError: Error | null;
  refetchManagedAgents: () => Promise<DirectoryResult<ManagedAgent[]>>;
  fetchRelayAgents: (pubkeys: string[]) => Promise<RelayAgent[]>;
  refetchOwnerProfiles: (pubkeys: string[]) => Promise<UsersBatchResponse>;
  memberPubkeys?: Iterable<string>;
  knownManagedAgentPubkeys?: Iterable<string>;
  knownRelayAgents?: readonly { pubkey: string }[];
}) {
  const directoryGatedAgentPubkeys = getDirectoryGatedAgentPubkeys({
    agentPubkeys,
    memberPubkeys,
    managedAgentPubkeys: knownManagedAgentPubkeys,
    relayAgents: knownRelayAgents,
  });
  const requestedAgentPubkeys = new Set(
    pubkeys
      .map(normalizePubkey)
      .filter((pubkey) => directoryGatedAgentPubkeys.has(pubkey)),
  );
  if (requestedAgentPubkeys.size === 0) {
    return [...pubkeys];
  }

  const [managedResult, relayAgents, ownerProfiles] = await Promise.all([
    refetchManagedAgents(),
    fetchRelayAgents([...requestedAgentPubkeys]).catch(() => null),
    ownerOnly
      ? refetchOwnerProfiles([...requestedAgentPubkeys]).catch(() => null)
      : Promise.resolve(null),
  ]);
  const relayDirectoryReady = relayAgents !== null;
  if (
    ownerOnly === undefined ||
    ownerPolicyError !== null ||
    managedResult.error !== null ||
    managedResult.data === undefined
  ) {
    return filterAdmittedMentionPubkeys(
      pubkeys,
      directoryGatedAgentPubkeys,
      new Set(),
    );
  }

  const managedPubkeys = new Set(
    managedResult.data.map((agent) => normalizePubkey(agent.pubkey)),
  );
  const freshGatedAgentPubkeys = getDirectoryGatedAgentPubkeys({
    agentPubkeys,
    memberPubkeys,
    managedAgentPubkeys: [
      ...(knownManagedAgentPubkeys ?? []),
      ...managedPubkeys,
    ],
    relayAgents: relayDirectoryReady
      ? [...(knownRelayAgents ?? []), ...relayAgents]
      : knownRelayAgents,
  });
  const mentionablePubkeys = getMentionableAgentPubkeys({
    currentPubkey,
    eligibilityScope,
    managedAgentPubkeys: managedPubkeys,
    relayAgents: relayDirectoryReady ? relayAgents : [],
    sharedChannelIds,
  });
  const admittedPubkeys = new Set(
    [...freshGatedAgentPubkeys].filter((pubkey) => {
      const isManagedAgent = managedPubkeys.has(normalizePubkey(pubkey));
      const directoryReady =
        isManagedAgent ||
        (relayDirectoryReady && (!ownerOnly || ownerProfiles !== null));
      return (
        getAgentMentionAdmission({
          isAgent: true,
          isManagedAgent,
          pubkey,
          ownerPubkey: ownerProfiles?.profiles[pubkey]?.ownerPubkey,
          currentPubkey,
          mentionableAgentPubkeys: mentionablePubkeys,
          directoryReady,
          ownerOnly,
        }) === "allow"
      );
    }),
  );
  return filterAdmittedMentionPubkeys(
    pubkeys,
    freshGatedAgentPubkeys,
    admittedPubkeys,
  );
}

export function useAgentMentionRevalidation({
  agentPubkeys,
  getSelectedAgentPubkeys,
  currentPubkey,
  eligibilityScope,
  sharedChannelIds,
  ownerOnly,
  ownerPolicyError,
  refetchManagedAgents,
  memberPubkeys,
  knownManagedAgentPubkeys,
  knownRelayAgents,
}: {
  agentPubkeys: ReadonlySet<string>;
  getSelectedAgentPubkeys: () => ReadonlySet<string>;
  currentPubkey: string | null;
  eligibilityScope: AgentEligibilityScope;
  sharedChannelIds: ReadonlySet<string>;
  ownerOnly: boolean | undefined;
  ownerPolicyError: Error | null;
  refetchManagedAgents: () => Promise<DirectoryResult<ManagedAgent[]>>;
  memberPubkeys?: Iterable<string>;
  knownManagedAgentPubkeys?: Iterable<string>;
  knownRelayAgents?: readonly { pubkey: string }[];
}) {
  const queryClient = useQueryClient();
  const refetchOwnerProfiles = React.useCallback(
    async (pubkeys: string[]) => {
      evictUsersBatchEntries(queryClient, pubkeys);
      return getUsersBatch(pubkeys);
    },
    [queryClient],
  );
  return React.useCallback(
    (pubkeys: readonly string[]) =>
      revalidateAgentMentionPubkeys({
        pubkeys,
        agentPubkeys: new Set([...agentPubkeys, ...getSelectedAgentPubkeys()]),
        currentPubkey,
        eligibilityScope,
        sharedChannelIds,
        ownerOnly,
        ownerPolicyError,
        refetchManagedAgents,
        fetchRelayAgents: (requestedPubkeys) =>
          revalidateRelayAgents(
            requestedPubkeys,
            eligibilityScope.type === "channel"
              ? eligibilityScope.channelId
              : undefined,
          ),
        refetchOwnerProfiles,
        memberPubkeys,
        knownManagedAgentPubkeys,
        knownRelayAgents,
      }),
    [
      agentPubkeys,
      currentPubkey,
      eligibilityScope,
      getSelectedAgentPubkeys,
      knownManagedAgentPubkeys,
      knownRelayAgents,
      memberPubkeys,
      ownerOnly,
      ownerPolicyError,
      refetchManagedAgents,
      refetchOwnerProfiles,
      sharedChannelIds,
    ],
  );
}
