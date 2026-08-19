import {
  loadActiveCommunityId,
  loadCommunities,
} from "@/features/communities/communityStorage";
import { normalizeRelayUrl } from "@/shared/lib/normalizeRelayUrl";

import type { CommunityBot } from "./types";

export const COMMUNITY_BOTS_STORAGE_KEY_PREFIX = "buzz-community-bots.v1";

export function communityBotsStorageKey(relayUrl: string): string {
  return `${COMMUNITY_BOTS_STORAGE_KEY_PREFIX}:${encodeURIComponent(normalizeRelayUrl(relayUrl))}`;
}

export function resolveCommunityBotsRelayUrl(): string {
  const communities = loadCommunities();
  const activeId = loadActiveCommunityId();
  const match =
    (activeId
      ? communities.find((community) => community.id === activeId)
      : undefined) ?? communities[0];
  return match?.relayUrl ?? "";
}

/**
 * Union of the latest kind:30624 catalog and the admin-device fallback.
 *
 * Shared ids prefer 30624 (newest published catalog). Local-only ids are
 * kept so an official Buzz relay — which always returns empty for 30624 —
 * cannot wipe an Install list that only exists on this device.
 */
export function mergeCommunityBots(
  relayBots: ReadonlyArray<CommunityBot>,
  localBots: ReadonlyArray<CommunityBot>,
): CommunityBot[] {
  const byId = new Map<string, CommunityBot>();
  for (const bot of localBots) {
    byId.set(bot.id, bot);
  }
  for (const bot of relayBots) {
    byId.set(bot.id, bot);
  }
  return [...byId.values()];
}

/**
 * `relayClient.publishEvent` rejects with the NIP-01 OK message. Official
 * `block/buzz` ingest maps unknown kinds to `restricted: unknown event kind`
 * (community pins 30623 have the same official-relay gap; out of scope here).
 */
export function isUnknownCommunityBotsKindError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes("unknown event kind") ||
    message.includes("unknown kind") ||
    message.includes("kind-not-allowed") ||
    message.includes("kind not allowed")
  );
}

export function isAlreadyCommunityBotMemberError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes("already a member") || message.includes("already exists")
  );
}

/** Official Buzz 9031 rejects with `member not found: <hex>` when the row is gone. */
export function isAlreadyGoneCommunityBotMemberError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes("member not found") ||
    message.includes("not a member") ||
    message.includes("not-a-member") ||
    message.includes("unknown member") ||
    message.includes("unknown-member") ||
    message.includes("already not a member") ||
    message.includes("no such member") ||
    message.includes("member missing") ||
    message.includes("already gone")
  );
}
