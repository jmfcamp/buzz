import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { invokeTauri } from "@/shared/api/tauri";
import { addRelayMember, removeRelayMember } from "@/shared/api/relayMembers";

import {
  fetchCommunityBots,
  otherBotsSharePubkey,
  publishCommunityBots,
  removeInstalledBot,
  upsertInstalledBot,
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

export function useCommunityBotsQuery(enabled = true) {
  return useQuery({
    enabled,
    queryKey: communityBotsQueryKey,
    queryFn: fetchCommunityBots,
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
  return useMutation({
    mutationFn: async (agent: RemoteOpenClawAgent) => {
      const identity = await invokeTauri<ResolvedBotIdentity>(
        "community_bots_resolve_identity",
        { agentId: agent.id, pubkey: agent.pubkey ?? null },
      );
      const installed = queryClient.getQueryData<CommunityBot[]>(
        communityBotsQueryKey,
      );
      const current = installed ?? (await fetchCommunityBots());
      await addRelayMember(identity.pubkey, "member");
      const next = upsertInstalledBot(current, {
        id: agent.id,
        name: agent.name?.trim() || agent.id,
        pubkey: identity.pubkey,
        source: "openclaw",
      });
      await publishCommunityBots(next);
      return next;
    },
    onSuccess: async (next) => {
      queryClient.setQueryData(communityBotsQueryKey, next);
      await queryClient.invalidateQueries({ queryKey: ["relayMembers"] });
    },
  });
}

export function useUninstallCommunityBotMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (bot: CommunityBot) => {
      const installed = queryClient.getQueryData<CommunityBot[]>(
        communityBotsQueryKey,
      );
      const current = installed ?? (await fetchCommunityBots());
      const next = removeInstalledBot(current, bot.id);
      if (!otherBotsSharePubkey(current, bot.id, bot.pubkey)) {
        await removeRelayMember(bot.pubkey);
      }
      await publishCommunityBots(next);
      return next;
    },
    onSuccess: async (next) => {
      queryClient.setQueryData(communityBotsQueryKey, next);
      await queryClient.invalidateQueries({ queryKey: ["relayMembers"] });
    },
  });
}
