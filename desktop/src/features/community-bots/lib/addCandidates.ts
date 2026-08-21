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

/** Catalog last-mile identity used as a DM / add-member peer — never the agent id. */
export function communityBotPeerCandidate(
  bot: CommunityBot,
): CommunityBotAddCandidate {
  return {
    pubkey: normalizePubkey(bot.pubkey),
    displayName: bot.name,
    avatarUrl: null,
    nip05Handle: null,
    ownerPubkey: null,
    isAgent: true,
  };
}

function appendCommunityBotPeers<T extends CommunityBotAddCandidate>(
  candidates: T[],
  bots: readonly CommunityBot[],
  matches: (bot: CommunityBot) => boolean,
  options?: { isArchived?: (pubkey: string) => boolean },
): T[] {
  const next = [...candidates];
  const seen = new Set(
    next.map((candidate) => normalizePubkey(candidate.pubkey)),
  );
  for (const bot of bots) {
    if (!matches(bot)) continue;
    const peer = communityBotPeerCandidate(bot);
    const pubkey = peer.pubkey;
    if (seen.has(pubkey)) continue;
    if (options?.isArchived?.(pubkey)) continue;
    seen.add(pubkey);
    next.push(peer as T);
  }
  return next;
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
  return appendCommunityBotPeers(
    candidates,
    bots,
    (bot) => communityBotMatchesQuery(bot, query),
    options,
  );
}

/** Empty-query directory and name search: community bots are valid DM peers. */
export function communityBotMatchesDmQuery(
  bot: Pick<CommunityBot, "id" | "name" | "pubkey">,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return (
    bot.id.toLowerCase().includes(needle) ||
    bot.name.toLowerCase().includes(needle) ||
    bot.pubkey.toLowerCase().includes(needle)
  );
}

/**
 * Merge installed community bots into the new-DM recipient directory.
 * Concrete (not generic) so a bare `[]` stays `CommunityBotAddCandidate[]`
 * instead of inferring `never` and breaking `tsc` on the compose picker.
 */
export function appendCommunityBotDmPeers(
  candidates: CommunityBotAddCandidate[],
  bots: readonly CommunityBot[],
  query: string,
  options?: { isArchived?: (pubkey: string) => boolean },
): CommunityBotAddCandidate[] {
  return appendCommunityBotPeers(
    candidates,
    bots,
    (bot) => communityBotMatchesDmQuery(bot, query),
    options,
  );
}

/** Managed/relay agents stay gated; catalog bots are DM peers like people. */
export function isEligibleNewMessageRecipient(input: {
  pubkey: string;
  isAgent?: boolean;
  eligibleAgentPubkeys: ReadonlySet<string>;
  communityBots: readonly CommunityBot[];
}): boolean {
  if (input.isAgent !== true) return true;
  if (isCommunityBotPubkey(input.pubkey, input.communityBots)) return true;
  return input.eligibleAgentPubkeys.has(normalizePubkey(input.pubkey));
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
