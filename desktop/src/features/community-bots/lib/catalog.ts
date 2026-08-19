import { KIND_COMMUNITY_BOTS } from "@/shared/constants/kinds";
import { relayClient } from "@/shared/api/relayClient";
import {
  addRelayMember,
  listRelayMembers,
  removeRelayMember,
} from "@/shared/api/relayMembers";
import { signRelayEvent } from "@/shared/api/tauri";
import type { RelayEvent } from "@/shared/api/types";
import { getStorageItem, setStorageItem } from "@/shared/lib/safeStorage";
import { normalizePubkey } from "@/shared/lib/pubkey";

import { rememberCommunityBotNames } from "./displayName";
import {
  communityBotsStorageKey,
  isAlreadyCommunityBotMemberError,
  isAlreadyGoneCommunityBotMemberError,
  isUnknownCommunityBotsKindError,
  mergeCommunityBots,
  resolveCommunityBotsRelayUrl,
} from "./localCatalog";
import { communityBotProfileLooksSecret } from "./profile";
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
  if (
    communityBotProfileLooksSecret(id) ||
    communityBotProfileLooksSecret(name) ||
    communityBotProfileLooksSecret(JSON.stringify(candidate))
  ) {
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

export function loadLocalCommunityBots(relayUrl: string): CommunityBot[] {
  const raw = getStorageItem(communityBotsStorageKey(relayUrl));
  if (!raw) return [];
  return parseCommunityBotsPayload(raw);
}

export function saveLocalCommunityBots(
  relayUrl: string,
  bots: ReadonlyArray<CommunityBot>,
): void {
  const payload: CommunityBotsPayload = {
    version: 1,
    bots: bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      pubkey: normalizePubkey(bot.pubkey),
      source: "openclaw",
    })),
  };
  setStorageItem(communityBotsStorageKey(relayUrl), JSON.stringify(payload));
  rememberCommunityBotNames(bots, relayUrl);
}

export async function fetchCommunityBots(
  relayUrl = resolveCommunityBotsRelayUrl(),
): Promise<CommunityBot[]> {
  const events = await relayClient.fetchEvents({
    kinds: [KIND_COMMUNITY_BOTS],
    "#d": [COMMUNITY_BOTS_D_TAG],
    limit: 50,
  });
  const bots = mergeCommunityBots(
    selectLatestCommunityBots(events),
    loadLocalCommunityBots(relayUrl),
  );
  rememberCommunityBotNames(bots, relayUrl);
  return bots;
}

async function publishCommunityBotsToRelay(
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
  const serialized = JSON.stringify(payload);
  if (communityBotProfileLooksSecret(serialized)) {
    throw new Error("community bot catalog must not include secrets");
  }
  const event = await signRelayEvent({
    kind: KIND_COMMUNITY_BOTS,
    content: serialized,
    tags: [["d", COMMUNITY_BOTS_D_TAG]],
  });
  await relayClient.publishEvent(
    event,
    "Timed out while saving community bots.",
    "Failed to save community bots.",
  );
}

export async function publishCommunityBots(
  bots: ReadonlyArray<CommunityBot>,
  relayUrl = resolveCommunityBotsRelayUrl(),
): Promise<void> {
  try {
    await publishCommunityBotsToRelay(bots);
    saveLocalCommunityBots(relayUrl, bots);
  } catch (error) {
    if (isUnknownCommunityBotsKindError(error)) {
      saveLocalCommunityBots(relayUrl, bots);
      return;
    }
    throw error;
  }
}

export async function ensureCommunityBotMember(pubkey: string): Promise<void> {
  const normalized = normalizePubkey(pubkey);
  try {
    const members = await listRelayMembers();
    if (
      members.some((member) => normalizePubkey(member.pubkey) === normalized)
    ) {
      return;
    }
  } catch {
    // Membership snapshot is optional; fall through and publish 9030.
  }
  try {
    await addRelayMember(normalized, "member");
  } catch (error) {
    if (isAlreadyCommunityBotMemberError(error)) {
      return;
    }
    throw error;
  }
}

export async function installCommunityBot(
  current: ReadonlyArray<CommunityBot>,
  bot: CommunityBot,
  relayUrl = resolveCommunityBotsRelayUrl(),
): Promise<CommunityBot[]> {
  await ensureCommunityBotMember(bot.pubkey);
  const next = upsertInstalledBot(current, bot);
  await publishCommunityBots(next, relayUrl);
  return next;
}

export async function removeCommunityBotRelayMember(
  pubkey: string,
): Promise<void> {
  const normalized = normalizePubkey(pubkey);
  try {
    const members = await listRelayMembers();
    if (
      !members.some((member) => normalizePubkey(member.pubkey) === normalized)
    ) {
      return;
    }
  } catch {
    // Membership snapshot is optional; fall through and publish 9031.
  }
  try {
    await removeRelayMember(normalized);
  } catch (error) {
    if (isAlreadyGoneCommunityBotMemberError(error)) {
      return;
    }
    throw error;
  }
}

export async function uninstallCommunityBot(
  current: ReadonlyArray<CommunityBot>,
  bot: CommunityBot,
  relayUrl = resolveCommunityBotsRelayUrl(),
): Promise<CommunityBot[]> {
  const next = removeInstalledBot(current, bot.id);
  if (!otherBotsSharePubkey(current, bot.id, bot.pubkey)) {
    await removeCommunityBotRelayMember(bot.pubkey);
  }
  await publishCommunityBots(next, relayUrl);
  return next;
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
