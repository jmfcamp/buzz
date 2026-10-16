import {
  installCommunityBot,
  publishCommunityBots,
  upsertInstalledBot,
} from "./catalog";
import { assertValidCommunityBotDisplayName } from "./profile";
import {
  defaultRemoteAgentName,
  descriptionField,
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

