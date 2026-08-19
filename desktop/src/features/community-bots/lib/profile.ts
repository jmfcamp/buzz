import { relayClient } from "@/shared/api/relayClient";
import type { RelayEvent } from "@/shared/api/types";
import { KIND_METADATA } from "@/shared/constants/kinds";
import { normalizePubkey } from "@/shared/lib/pubkey";

import {
  MAX_COMMUNITY_BOT_NAME_LEN,
  normalizeCommunityBotDisplayName,
} from "./types";

export function communityBotProfileLooksSecret(value: string): boolean {
  const lowered = value.toLowerCase();
  return (
    lowered.includes('"password"') ||
    lowered.includes('"nsec"') ||
    lowered.includes("nsec1") ||
    lowered.includes('"device_token"') ||
    lowered.includes('"devicetoken"') ||
    lowered.includes('"private_key"') ||
    lowered.includes('"privatekey"')
  );
}

export function isMissingMintedBotIdentityError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return message.includes("no minted identity");
}

export function assertValidCommunityBotDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("bot name is required");
  }
  if (trimmed.length > MAX_COMMUNITY_BOT_NAME_LEN) {
    throw new Error(
      `bot name must be at most ${MAX_COMMUNITY_BOT_NAME_LEN} characters`,
    );
  }
  if (communityBotProfileLooksSecret(trimmed)) {
    throw new Error("bot profile must not include secrets");
  }
  return trimmed;
}

export function buildCommunityBotProfileContent(displayName: string): string {
  const name = assertValidCommunityBotDisplayName(
    normalizeCommunityBotDisplayName(displayName, ""),
  );
  const content = JSON.stringify({ name, display_name: name });
  if (communityBotProfileLooksSecret(content)) {
    throw new Error("bot profile must not include secrets");
  }
  return content;
}

export function assertValidBotProfileEvent(
  event: RelayEvent,
  botPubkey: string,
  displayName: string,
): void {
  if (event.kind !== KIND_METADATA) {
    throw new Error("bot profile must be kind 0");
  }
  if (normalizePubkey(event.pubkey) !== normalizePubkey(botPubkey)) {
    throw new Error("bot profile must be signed as the bot");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.content);
  } catch {
    throw new Error("bot profile content must be JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("bot profile content must be metadata JSON");
  }
  const fields = parsed as Record<string, unknown>;
  if (fields.name !== displayName || fields.display_name !== displayName) {
    throw new Error("bot profile name mismatch");
  }
  if (
    communityBotProfileLooksSecret(event.content) ||
    communityBotProfileLooksSecret(JSON.stringify(event))
  ) {
    throw new Error("bot profile must not include secrets");
  }
}

export async function publishCommunityBotProfile(
  event: RelayEvent,
): Promise<void> {
  await relayClient.publishEvent(
    event,
    "Timed out while publishing the bot profile.",
    "Failed to publish the bot profile.",
  );
}
