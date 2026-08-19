import { normalizePubkey } from "@/shared/lib/pubkey";

import type { CommunityBot } from "./types";

export type CommunityBotAddCandidate = {
  pubkey: string;
  displayName: string | null;
  avatarUrl: string | null;
  nip05Handle: string | null;
  ownerPubkey: string | null;
  isAgent: true;
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
>(candidates: T[], bots: readonly CommunityBot[], query: string): T[] {
  const next = [...candidates];
  const seen = new Set(
    next.map((candidate) => normalizePubkey(candidate.pubkey)),
  );
  for (const bot of bots) {
    if (!communityBotMatchesQuery(bot, query)) continue;
    const pubkey = normalizePubkey(bot.pubkey);
    if (seen.has(pubkey)) continue;
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
