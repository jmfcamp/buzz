import type { ChannelRole } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

import type { CommunityBot } from "./types";

/** Catalog bots join rooms as Buzz channel bots, not ordinary members. */
export const COMMUNITY_BOT_CHANNEL_ROLE: Exclude<ChannelRole, "owner"> = "bot";

export type CommunityBotAddCandidate = {
  pubkey: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  nip05Handle?: string | null;
  ownerPubkey?: string | null;
  isAgent?: boolean;
};

export function communityBotMatchesQuery(
  bot: Pick<CommunityBot, "id" | "name" | "pubkey">,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return false;
  return (
    bot.id.toLowerCase().includes(needle) ||
    bot.name.toLowerCase().includes(needle) ||
    bot.pubkey.toLowerCase().includes(needle)
  );
}

/** Merge installed community bots into the channel add-member candidate list. */
export function appendCommunityBotCandidates<
  T extends CommunityBotAddCandidate,
>(
  candidates: T[],
  bots: readonly CommunityBot[],
  query: string,
  options?: { isArchived?: (pubkey: string) => boolean },
): T[] {
  const next = [...candidates];
  const seen = new Set(
    next.map((candidate) => normalizePubkey(candidate.pubkey)),
  );
  for (const bot of bots) {
    if (!communityBotMatchesQuery(bot, query)) continue;
    const pubkey = normalizePubkey(bot.pubkey);
    if (seen.has(pubkey)) continue;
    if (options?.isArchived?.(pubkey)) continue;
    seen.add(pubkey);
    next.push({
      pubkey,
      displayName: bot.name,
      avatarUrl: null,
      nip05Handle: null,
      ownerPubkey: null,
      isAgent: true,
    } as T);
  }
  return next;
}

export function communityBotAllowedPubkeys(
  bots: readonly CommunityBot[],
): string[] {
  return [...new Set(bots.map((bot) => normalizePubkey(bot.pubkey)))];
}

export function isCommunityBotPubkey(
  pubkey: string,
  bots: readonly CommunityBot[],
): boolean {
  const normalized = normalizePubkey(pubkey);
  return bots.some((bot) => normalizePubkey(bot.pubkey) === normalized);
}

/** Role sent with `AddChannelMembersInput` when adding a catalog bot. */
export function channelRoleForAddMember(
  candidate: Pick<CommunityBotAddCandidate, "pubkey" | "isAgent">,
  bots: readonly CommunityBot[],
): Exclude<ChannelRole, "owner"> {
  if (candidate.isAgent || isCommunityBotPubkey(candidate.pubkey, bots)) {
    return COMMUNITY_BOT_CHANNEL_ROLE;
  }
  return "member";
}

export function communityBotAddMemberInput(
  pubkeys: string | readonly string[],
): {
  pubkeys: string[];
  role: Exclude<ChannelRole, "owner">;
} {
  const list = (Array.isArray(pubkeys) ? pubkeys : [pubkeys]).map((pubkey) =>
    normalizePubkey(pubkey),
  );
  return {
    pubkeys: [...new Set(list)],
    role: COMMUNITY_BOT_CHANNEL_ROLE,
  };
}
