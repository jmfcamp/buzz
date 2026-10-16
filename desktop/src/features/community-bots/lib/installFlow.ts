import {
  installCommunityBot,
  publishCommunityBots,
  upsertInstalledBot,
} from "./catalog";
import { assertValidCommunityBotDisplayName } from "./profile";
import {
  defaultRemoteAgentName,
  MAX_COMMUNITY_BOT_DESCRIPTION_LEN,
  normalizeCommunityBotDisplayName,
  type CommunityBot,
  type RemoteOpenClawAgent,
  type ResolvedBotIdentity,
} from "./types";

export async function completeCommunityBotInstall(input: {
  current: ReadonlyArray<CommunityBot>;
  agent: RemoteOpenClawAgent;
  displayName?: string;
  description?: string;
  identity: ResolvedBotIdentity;
  relayUrl: string;
}): Promise<CommunityBot[]> {
  const name = assertValidCommunityBotDisplayName(
    normalizeCommunityBotDisplayName(
      input.displayName,
      defaultRemoteAgentName(input.agent),
    ),
  );
  return installCommunityBot(
    input.current,
    {
      id: input.agent.id,
      name,
      pubkey: input.identity.pubkey,
      source: "openclaw",
      ...descriptionField(input.description),
    },
    input.relayUrl,
  );
}

export async function completeCommunityBotRename(input: {
  current: ReadonlyArray<CommunityBot>;
  bot: CommunityBot;
  displayName: string;
  /** Undefined keeps the current description; "" clears it. */
  description?: string;
  relayUrl: string;
}): Promise<CommunityBot[]> {
  const name = assertValidCommunityBotDisplayName(
    normalizeCommunityBotDisplayName(input.displayName, input.bot.id),
  );
  const { description: _previous, ...rest } = input.bot;
  const next = upsertInstalledBot(input.current, {
    ...rest,
    name,
    ...descriptionField(
      input.description === undefined ? input.bot.description : input.description,
    ),
  });
  await publishCommunityBots(next, input.relayUrl);
  return next;
}

/** Trimmed, length-capped description field, or nothing when empty. */
export function descriptionField(description: string | undefined): { description?: string } {
  const trimmed = description?.trim().slice(0, MAX_COMMUNITY_BOT_DESCRIPTION_LEN) ?? "";
  return trimmed ? { description: trimmed } : {};
}
