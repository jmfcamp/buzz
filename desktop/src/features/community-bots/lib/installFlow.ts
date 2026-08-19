import {
  installCommunityBot,
  publishCommunityBots,
  upsertInstalledBot,
} from "./catalog";
import { assertValidCommunityBotDisplayName } from "./profile";
import {
  defaultRemoteAgentName,
  normalizeCommunityBotDisplayName,
  type CommunityBot,
  type RemoteOpenClawAgent,
  type ResolvedBotIdentity,
} from "./types";

export async function completeCommunityBotInstall(input: {
  current: ReadonlyArray<CommunityBot>;
  agent: RemoteOpenClawAgent;
  displayName?: string;
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
    },
    input.relayUrl,
  );
}

export async function completeCommunityBotRename(input: {
  current: ReadonlyArray<CommunityBot>;
  bot: CommunityBot;
  displayName: string;
  relayUrl: string;
}): Promise<CommunityBot[]> {
  const name = assertValidCommunityBotDisplayName(
    normalizeCommunityBotDisplayName(input.displayName, input.bot.id),
  );
  const next = upsertInstalledBot(input.current, { ...input.bot, name });
  await publishCommunityBots(next, input.relayUrl);
  return next;
}
