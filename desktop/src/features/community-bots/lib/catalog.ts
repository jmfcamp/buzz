import { KIND_COMMUNITY_BOTS } from "@/shared/constants/kinds";
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import type { RelayEvent } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

import type { CommunityBot, CommunityBotsPayload } from "./types";

export const COMMUNITY_BOTS_D_TAG = "buzz:community-bots";

function isHexPubkey(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function parseBot(value: unknown): CommunityBot | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
  const pubkey =
    typeof candidate.pubkey === "string"
      ? normalizePubkey(candidate.pubkey)
      : "";
  if (!id || !name || !isHexPubkey(pubkey)) {
    return null;
  }
  if (candidate.source !== "openclaw") {
    return null;
  }
  return { id, name, pubkey, source: "openclaw" };
}

export function parseCommunityBotsPayload(content: string): CommunityBot[] {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return [];
    }
    const candidate = parsed as Record<string, unknown>;
    if (candidate.version !== 1 || !Array.isArray(candidate.bots)) {
      return [];
    }
    const bots: CommunityBot[] = [];
    const seen = new Set<string>();
    for (const entry of candidate.bots) {
      const bot = parseBot(entry);
      if (!bot || seen.has(bot.id)) continue;
      seen.add(bot.id);
      bots.push(bot);
    }
    return bots;
  } catch {
    return [];
  }
}

/** Latest admin-authored catalog wins (NIP-33 LWW by created_at). */
export function selectLatestCommunityBots(
  events: ReadonlyArray<RelayEvent>,
): CommunityBot[] {
  let latest: RelayEvent | null = null;
  for (const event of events) {
    if (event.kind !== KIND_COMMUNITY_BOTS) continue;
    if (!latest || event.created_at > latest.created_at) {
      latest = event;
    }
  }
  return latest ? parseCommunityBotsPayload(latest.content) : [];
}

export async function fetchCommunityBots(): Promise<CommunityBot[]> {
  const events = await relayClient.fetchEvents({
    kinds: [KIND_COMMUNITY_BOTS],
    "#d": [COMMUNITY_BOTS_D_TAG],
    limit: 50,
  });
  return selectLatestCommunityBots(events);
}

export async function publishCommunityBots(
  bots: ReadonlyArray<CommunityBot>,
): Promise<void> {
  const payload: CommunityBotsPayload = {
    version: 1,
    bots: bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      pubkey: normalizePubkey(bot.pubkey),
      source: "openclaw",
    })),
  };
  const event = await signRelayEvent({
    kind: KIND_COMMUNITY_BOTS,
    content: JSON.stringify(payload),
    tags: [["d", COMMUNITY_BOTS_D_TAG]],
  });
  await relayClient.publishEvent(
    event,
    "Timed out while saving community bots.",
    "Failed to save community bots.",
  );
}

export function upsertInstalledBot(
  bots: ReadonlyArray<CommunityBot>,
  next: CommunityBot,
): CommunityBot[] {
  const pubkey = normalizePubkey(next.pubkey);
  const without = bots.filter((bot) => bot.id !== next.id);
  return [...without, { ...next, pubkey, source: "openclaw" }];
}

export function removeInstalledBot(
  bots: ReadonlyArray<CommunityBot>,
  agentId: string,
): CommunityBot[] {
  return bots.filter((bot) => bot.id !== agentId);
}

export function otherBotsSharePubkey(
  bots: ReadonlyArray<CommunityBot>,
  agentId: string,
  pubkey: string,
): boolean {
  const normalized = normalizePubkey(pubkey);
  return bots.some(
    (bot) => bot.id !== agentId && normalizePubkey(bot.pubkey) === normalized,
  );
}
