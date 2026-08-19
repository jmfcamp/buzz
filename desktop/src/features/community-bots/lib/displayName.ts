import type {
  UserProfileSummary,
  UsersBatchResponse,
} from "@/shared/api/types";
import { getStorageItem } from "@/shared/lib/safeStorage";
import { normalizePubkey, truncatePubkey } from "@/shared/lib/pubkey";

import {
  communityBotsStorageKey,
  resolveCommunityBotsRelayUrl,
} from "./localCatalog";
import type { CommunityBot } from "./types";

let rememberedRelayUrl = "";
let rememberedNames = new Map<string, string>();

export function communityBotNamesByPubkey(
  bots: ReadonlyArray<CommunityBot>,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const bot of bots) {
    const name = bot.name.trim();
    if (!name) continue;
    names.set(normalizePubkey(bot.pubkey), name);
  }
  return names;
}

function activeCommunityBotsRelayUrl(explicit?: string): string {
  if (explicit !== undefined) return explicit;
  try {
    return resolveCommunityBotsRelayUrl();
  } catch {
    return rememberedRelayUrl;
  }
}

export function rememberCommunityBotNames(
  bots: ReadonlyArray<CommunityBot>,
  relayUrl?: string,
): void {
  rememberedRelayUrl = activeCommunityBotsRelayUrl(relayUrl);
  rememberedNames = communityBotNamesByPubkey(bots);
}

export function resetCommunityBotNameCache(): void {
  rememberedRelayUrl = "";
  rememberedNames = new Map();
}

/**
 * Kind-0 (or member-row) labels that are missing or just the raw key.
 * Catalog names win for these; a real display name is left alone.
 */
export function isUnknownProfileDisplayName(
  value: string | null | undefined,
  pubkey: string,
): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return true;
  const lowered = trimmed.toLowerCase();
  if (
    lowered.startsWith("npub1") ||
    lowered.startsWith("nostr:npub1") ||
    lowered === "unnamed member" ||
    lowered === "unknown"
  ) {
    return true;
  }
  const normalized = normalizePubkey(pubkey);
  if (lowered === normalized) return true;
  return lowered === truncatePubkey(pubkey).toLowerCase();
}

function loadLocalBotNames(relayUrl: string): Map<string, string> {
  if (typeof window === "undefined") return new Map();
  const raw = getStorageItem(communityBotsStorageKey(relayUrl));
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; bots?: unknown };
    if (parsed.version !== 1 || !Array.isArray(parsed.bots)) {
      return new Map();
    }
    const bots: CommunityBot[] = [];
    for (const entry of parsed.bots) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        continue;
      }
      const candidate = entry as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const name =
        typeof candidate.name === "string" ? candidate.name.trim() : "";
      const pubkey =
        typeof candidate.pubkey === "string"
          ? normalizePubkey(candidate.pubkey)
          : "";
      if (!id || !name || !/^[0-9a-f]{64}$/.test(pubkey)) continue;
      bots.push({ id, name, pubkey, source: "openclaw" });
    }
    return communityBotNamesByPubkey(bots);
  } catch {
    return new Map();
  }
}

export function lookupCommunityBotName(
  pubkey: string,
  bots?: ReadonlyArray<CommunityBot>,
  relayUrl?: string,
): string | undefined {
  if (bots) {
    return communityBotNamesByPubkey(bots).get(normalizePubkey(pubkey));
  }
  const resolved = activeCommunityBotsRelayUrl(relayUrl);
  if (rememberedRelayUrl === resolved) {
    const remembered = rememberedNames.get(normalizePubkey(pubkey));
    if (remembered) return remembered;
  }
  return loadLocalBotNames(resolved).get(normalizePubkey(pubkey));
}

/** Catalog name when kind 0 is missing or pubkey-like unknown. */
export function overlayCommunityBotDisplayName(
  displayName: string | null | undefined,
  pubkey: string,
  bots?: ReadonlyArray<CommunityBot>,
): string | null {
  const catalogName = lookupCommunityBotName(pubkey, bots)?.trim();
  if (isUnknownProfileDisplayName(displayName, pubkey)) {
    return catalogName || null;
  }
  return displayName?.trim() || catalogName || null;
}

export function overlayCommunityBotNamesOnProfiles(
  profiles: Record<string, UserProfileSummary>,
  bots: ReadonlyArray<CommunityBot>,
): Record<string, UserProfileSummary> {
  const names = communityBotNamesByPubkey(bots);
  if (names.size === 0) return profiles;

  let changed = false;
  const next = { ...profiles };
  for (const [pubkey, summary] of Object.entries(profiles)) {
    const catalogName = names.get(normalizePubkey(pubkey));
    if (
      !catalogName ||
      !isUnknownProfileDisplayName(summary.displayName, pubkey)
    ) {
      continue;
    }
    next[pubkey] = { ...summary, displayName: catalogName };
    changed = true;
  }
  return changed ? next : profiles;
}

export function overlayCommunityBotNamesOnBatch(
  batch: UsersBatchResponse,
  bots: ReadonlyArray<CommunityBot>,
  requestedPubkeys: ReadonlyArray<string>,
): UsersBatchResponse {
  const names = communityBotNamesByPubkey(bots);
  if (names.size === 0) return batch;

  const profiles = overlayCommunityBotNamesOnProfiles(batch.profiles, bots);
  let seeded = profiles;
  for (const raw of requestedPubkeys) {
    const pubkey = normalizePubkey(raw);
    const catalogName = names.get(pubkey);
    if (!catalogName || seeded[pubkey]) continue;
    if (seeded === profiles) {
      seeded = { ...profiles };
    }
    seeded[pubkey] = {
      displayName: catalogName,
      name: catalogName,
      avatarUrl: null,
      nip05Handle: null,
      ownerPubkey: null,
    };
  }

  const missing = batch.missing.filter(
    (pubkey) => !seeded[normalizePubkey(pubkey)],
  );
  if (seeded === batch.profiles && missing.length === batch.missing.length) {
    return batch;
  }
  return { profiles: seeded, missing };
}
