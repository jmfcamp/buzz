import { overlayCommunityBotDisplayName } from "@/features/community-bots/lib/displayName";
import type { CommunityBot } from "@/features/community-bots/lib/types";
import { normalizePubkey, truncatePubkey } from "@/shared/lib/pubkey";

export type CommunityAgentSource = "catalog" | "leftover";

export type CommunityAgentListItem = {
  pubkey: string;
  displayName: string;
  truncatedPubkey: string;
  archived: boolean;
  source: CommunityAgentSource;
  catalogId?: string;
};

export type CommunityAgentMemberInput = {
  pubkey: string;
  displayName?: string | null;
  role?: string | null;
  isAgent?: boolean;
};

export type CommunityAgentProfileInput = {
  displayName?: string | null;
  isAgent?: boolean;
};

/** Channel leftovers: catalog bots join as role `bot`; agents also set `isAgent`. */
export function isLeftoverCommunityAgentMember(
  member: CommunityAgentMemberInput,
  profile?: CommunityAgentProfileInput | null,
): boolean {
  return (
    member.role === "bot" ||
    member.isAgent === true ||
    profile?.isAgent === true
  );
}

function resolveLeftoverDisplayName(
  member: CommunityAgentMemberInput,
  pubkey: string,
  profile?: CommunityAgentProfileInput | null,
): string {
  return (
    overlayCommunityBotDisplayName(member.displayName, pubkey) ||
    profile?.displayName?.trim() ||
    truncatePubkey(pubkey)
  );
}

/**
 * Community-level retire list: current catalog bots plus leftover
 * agent/bot-role channel members that uninstall left behind.
 * People (non-agent members) are excluded.
 */
export function collectCommunityAgents(input: {
  catalogBots: ReadonlyArray<Pick<CommunityBot, "id" | "name" | "pubkey">>;
  leftoverMembers: ReadonlyArray<CommunityAgentMemberInput>;
  archivedPubkeys?: ReadonlyArray<string>;
  profiles?: Record<string, CommunityAgentProfileInput | undefined>;
}): CommunityAgentListItem[] {
  const archived = new Set(
    (input.archivedPubkeys ?? []).map((pubkey) => normalizePubkey(pubkey)),
  );
  const seen = new Set<string>();
  const items: CommunityAgentListItem[] = [];

  for (const bot of input.catalogBots) {
    const pubkey = normalizePubkey(bot.pubkey);
    if (!pubkey || seen.has(pubkey)) continue;
    seen.add(pubkey);
    const name = bot.name.trim();
    items.push({
      pubkey,
      displayName: name || truncatePubkey(pubkey),
      truncatedPubkey: truncatePubkey(pubkey),
      archived: archived.has(pubkey),
      source: "catalog",
      catalogId: bot.id,
    });
  }

  for (const member of input.leftoverMembers) {
    const pubkey = normalizePubkey(member.pubkey);
    if (!pubkey || seen.has(pubkey)) continue;
    const profile = input.profiles?.[pubkey];
    if (!isLeftoverCommunityAgentMember(member, profile)) continue;
    seen.add(pubkey);
    items.push({
      pubkey,
      displayName: resolveLeftoverDisplayName(member, pubkey, profile),
      truncatedPubkey: truncatePubkey(pubkey),
      archived: archived.has(pubkey),
      source: "leftover",
    });
  }

  return items.sort((left, right) => {
    const byName = left.displayName.localeCompare(
      right.displayName,
      undefined,
      {
        sensitivity: "base",
      },
    );
    if (byName !== 0) return byName;
    if (left.source !== right.source) {
      return left.source === "catalog" ? -1 : 1;
    }
    return left.pubkey.localeCompare(right.pubkey);
  });
}
