import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCommunities } from "@/features/communities/useCommunities";
import { invokeTauri } from "@/shared/api/tauri";

import {
  fetchCommunityBots,
  installCommunityBot,
  uninstallCommunityBot,
} from "./lib/catalog";
import type {
  CommunityBot,
  CommunityBotsStatus,
  RemoteOpenClawAgent,
  ResolvedBotIdentity,
} from "./lib/types";

export const communityBotsQueryKey = ["communityBots"] as const;
export const communityBotsStatusQueryKey = ["communityBotsStatus"] as const;
export const communityBotsRemoteAgentsQueryKey = [
  "communityBotsRemoteAgents",
] as const;

function useCommunityBotsRelayUrl(): string {
  const { activeCommunity } = useCommunities();
  return activeCommunity?.relayUrl ?? "";
}

export function useCommunityBotsQuery(enabled = true) {
  const relayUrl = useCommunityBotsRelayUrl();
  return useQuery({
    enabled,
    queryKey: [...communityBotsQueryKey, relayUrl],
    queryFn: () => fetchCommunityBots(relayUrl),
    staleTime: 15_000,
  });
}

export function useCommunityBotsStatusQuery(enabled = true) {
  return useQuery({
    enabled,
    queryKey: communityBotsStatusQueryKey,
    queryFn: () =>
      invokeTauri<CommunityBotsStatus>("community_bots_get_status"),
    staleTime: 5_000,
  });
}

export function useCommunityBotsRemoteAgentsQuery(enabled = false) {
  return useQuery({
    enabled,
    queryKey: communityBotsRemoteAgentsQueryKey,
    queryFn: () =>
      invokeTauri<RemoteOpenClawAgent[]>("community_bots_list_remote_agents"),
    staleTime: 15_000,
  });
}

export function useConnectCommunityBotsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; password: string; token?: string }) =>
      invokeTauri<CommunityBotsStatus>("community_bots_connect", input),
    onSuccess: async (status) => {
      queryClient.setQueryData(communityBotsStatusQueryKey, status);
      if (status.state === "connected") {
        await queryClient.invalidateQueries({
          queryKey: communityBotsRemoteAgentsQueryKey,
        });
      }
    },
  });
}

export function useDisconnectCommunityBotsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      invokeTauri<CommunityBotsStatus>("community_bots_disconnect"),
    onSuccess: async (status) => {
      queryClient.setQueryData(communityBotsStatusQueryKey, status);
      await queryClient.invalidateQueries({
        queryKey: communityBotsRemoteAgentsQueryKey,
      });
    },
  });
}

export function useInstallCommunityBotMutation() {
  const queryClient = useQueryClient();
  const relayUrl = useCommunityBotsRelayUrl();
  return useMutation({
    mutationFn: async (agent: RemoteOpenClawAgent) => {
      const identity = await invokeTauri<ResolvedBotIdentity>(
        "community_bots_resolve_identity",
        { agentId: agent.id, pubkey: agent.pubkey ?? null },
      );
      const installed = queryClient.getQueryData<CommunityBot[]>([
        ...communityBotsQueryKey,
        relayUrl,
      ]);
      const current = installed ?? (await fetchCommunityBots(relayUrl));
      return installCommunityBot(
        current,
        {
          id: agent.id,
          name: agent.name?.trim() || agent.id,
          pubkey: identity.pubkey,
          source: "openclaw",
        },
        relayUrl,
      );
    },
    onSuccess: async (next) => {
      queryClient.setQueryData([...communityBotsQueryKey, relayUrl], next);
      await queryClient.invalidateQueries({ queryKey: ["relayMembers"] });
    },
  });
}

export function useUninstallCommunityBotMutation() {
  const queryClient = useQueryClient();
  const relayUrl = useCommunityBotsRelayUrl();
  return useMutation({
    mutationFn: async (bot: CommunityBot) => {
      const installed = queryClient.getQueryData<CommunityBot[]>([
        ...communityBotsQueryKey,
        relayUrl,
      ]);
      const current = installed ?? (await fetchCommunityBots(relayUrl));
      return uninstallCommunityBot(current, bot, relayUrl);
    },
    onSuccess: async (next) => {
      queryClient.setQueryData([...communityBotsQueryKey, relayUrl], next);
      await queryClient.invalidateQueries({ queryKey: ["relayMembers"] });
    },
  });
}
