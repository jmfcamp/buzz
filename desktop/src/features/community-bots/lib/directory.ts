import type { Channel, PresenceStatus } from "@/shared/api/types";
import { safeNpub } from "@/shared/lib/nostrUtils";
import { normalizePubkey } from "@/shared/lib/pubkey";

import { overlayCommunityBotDisplayName } from "./displayName";
import type { CommunityBot, CommunityBotsState } from "./types";

/** Runtime controls that belong to managed Agents, never this directory. */
export const COMMUNITY_BOT_DIRECTORY_FORBIDDEN_ACTIONS = [
  "Start",
  "Stop",
  "Restart",
  "Message",
  "Edit",
] as const;

export type CommunityBotDirectoryStatusId =
  | "installed"
  | "online"
  | "away"
  | "offline"
  | "not_paired";

export type CommunityBotDirectoryStatus = {
  id: CommunityBotDirectoryStatusId;
  label: string;
};

export type CommunityBotDirectoryCard = {
  avatarUrl: string | null;
  id: string;
  name: string;
  pubkey: string;
};

export type CommunityBotDirectoryChannel = {
  id: string;
  name: string;
};

export type CommunityBotDirectoryDetail = {
  avatarUrl: string | null;
  channels: CommunityBotDirectoryChannel[];
  description: string | null;
  hexPubkey: string;
  id: string;
  name: string;
  npub: string | null;
  status: CommunityBotDirectoryStatus;
};

export function isCommunityBotDirectoryForbiddenAction(label: string): boolean {
  return (
    COMMUNITY_BOT_DIRECTORY_FORBIDDEN_ACTIONS as readonly string[]
  ).includes(label);
}

/**
 * Catalog / display name for directory cards and titles. Never a raw pubkey.
 */
export function communityBotDirectoryName(
  bot: CommunityBot,
  profileDisplayName?: string | null,
): string {
  const name = overlayCommunityBotDisplayName(profileDisplayName, bot.pubkey, [
    bot,
  ]);
  const trimmed = name?.trim() || bot.name.trim();
  if (!trimmed) {
    return "Community bot";
  }
  return trimmed;
}

export function communityBotDirectoryDescription(
  about: string | null | undefined,
): string | null {
  const trimmed = about?.trim() ?? "";
  return trimmed || null;
}

/**
 * Hide archived / retired identities the same way mention discovery and the
 * Settings retire list do: archive always wins.
 */
export function visibleCommunityDirectoryBots(
  bots: ReadonlyArray<CommunityBot>,
  isArchived: (pubkey: string) => boolean,
): CommunityBot[] {
  return bots
    .filter((bot) => !isArchived(normalizePubkey(bot.pubkey)))
    .slice()
    .sort((left, right) =>
      communityBotDirectoryName(left).localeCompare(
        communityBotDirectoryName(right),
        undefined,
        { sensitivity: "base" },
      ),
    );
}

export function findCommunityDirectoryBot(
  bots: ReadonlyArray<CommunityBot>,
  botId: string,
): CommunityBot | undefined {
  const needle = botId.trim();
  if (!needle) return undefined;
  const byId = bots.find((bot) => bot.id === needle);
  if (byId) return byId;
  const pubkey = normalizePubkey(needle);
  return bots.find((bot) => normalizePubkey(bot.pubkey) === pubkey);
}

/**
 * Status from signals the community-bots feature and relay already expose.
 * Presence wins when the relay reported it; otherwise catalog + pairing.
 */
export function resolveCommunityBotDirectoryStatus(input: {
  gatewayState?: CommunityBotsState | null;
  isRelayMember?: boolean | null;
  presence?: PresenceStatus | null;
}): CommunityBotDirectoryStatus {
  if (input.presence === "online") {
    return { id: "online", label: "Online" };
  }
  if (input.presence === "away") {
    return { id: "away", label: "Away" };
  }
  if (input.presence === "offline") {
    return { id: "offline", label: "Offline" };
  }
  if (input.isRelayMember === false) {
    return { id: "not_paired", label: "Not paired" };
  }
  if (
    input.gatewayState === "disconnected" ||
    input.gatewayState === "pending" ||
    input.gatewayState === "insufficient_scopes"
  ) {
    return { id: "not_paired", label: "Not paired" };
  }
  return { id: "installed", label: "Installed" };
}

/**
 * Channels the bot currently belongs to, from the same membership lists the
 * mention picker and channel member rows use (`memberPubkeys` on each channel).
 */
export function communityBotMemberChannels(
  pubkey: string,
  channels: ReadonlyArray<
    Pick<
      Channel,
      "archivedAt" | "channelType" | "id" | "memberPubkeys" | "name"
    >
  >,
): CommunityBotDirectoryChannel[] {
  const normalized = normalizePubkey(pubkey);
  if (!normalized) return [];

  return channels
    .filter((channel) => {
      if (channel.channelType === "dm") return false;
      if (channel.archivedAt) return false;
      return channel.memberPubkeys.some(
        (member) => normalizePubkey(member) === normalized,
      );
    })
    .map((channel) => ({ id: channel.id, name: channel.name }))
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );
}

export function communityBotDirectoryCard(
  bot: CommunityBot,
  profile?: { avatarUrl?: string | null; displayName?: string | null } | null,
): CommunityBotDirectoryCard {
  return {
    avatarUrl: profile?.avatarUrl?.trim() || null,
    id: bot.id,
    name: communityBotDirectoryName(bot, profile?.displayName),
    pubkey: normalizePubkey(bot.pubkey),
  };
}

export function communityBotDirectoryDetail(input: {
  bot: CommunityBot;
  channels: ReadonlyArray<
    Pick<
      Channel,
      "archivedAt" | "channelType" | "id" | "memberPubkeys" | "name"
    >
  >;
  gatewayState?: CommunityBotsState | null;
  isRelayMember?: boolean | null;
  presence?: PresenceStatus | null;
  profile?: {
    about?: string | null;
    avatarUrl?: string | null;
    displayName?: string | null;
  } | null;
}): CommunityBotDirectoryDetail {
  const hexPubkey = normalizePubkey(input.bot.pubkey);
  return {
    avatarUrl: input.profile?.avatarUrl?.trim() || null,
    channels: communityBotMemberChannels(hexPubkey, input.channels),
    description: communityBotDirectoryDescription(input.profile?.about),
    hexPubkey,
    id: input.bot.id,
    name: communityBotDirectoryName(input.bot, input.profile?.displayName),
    npub: safeNpub(hexPubkey),
    status: resolveCommunityBotDirectoryStatus({
      gatewayState: input.gatewayState,
      isRelayMember: input.isRelayMember,
      presence: input.presence,
    }),
  };
}
