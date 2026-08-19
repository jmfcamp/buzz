import type { RelayEvent } from "@/shared/api/types";

import {
  installCommunityBot,
  publishCommunityBots,
  upsertInstalledBot,
} from "./catalog";
import {
  assertValidBotProfileEvent,
  assertValidCommunityBotDisplayName,
  isMissingMintedBotIdentityError,
  publishCommunityBotProfile,
} from "./profile";
import {
  defaultRemoteAgentName,
  normalizeCommunityBotDisplayName,
  type CommunityBot,
  type RemoteOpenClawAgent,
  type ResolvedBotIdentity,
} from "./types";

export type SignMintedCommunityBotProfile = (input: {
  agentId: string;
  name: string;
}) => Promise<RelayEvent>;

async function signMintedProfileIfPresent(
  signMintedProfile: SignMintedCommunityBotProfile,
  agentId: string,
  name: string,
  botPubkey: string,
  required: boolean,
): Promise<RelayEvent | null> {
  try {
    const profile = await signMintedProfile({ agentId, name });
    assertValidBotProfileEvent(profile, botPubkey, name);
    return profile;
  } catch (error) {
    if (!required && isMissingMintedBotIdentityError(error)) {
      return null;
    }
    throw error;
  }
}

export async function completeCommunityBotInstall(input: {
  current: ReadonlyArray<CommunityBot>;
  agent: RemoteOpenClawAgent;
  displayName?: string;
  identity: ResolvedBotIdentity;
  relayUrl: string;
  signMintedProfile: SignMintedCommunityBotProfile;
}): Promise<CommunityBot[]> {
  const name = assertValidCommunityBotDisplayName(
    normalizeCommunityBotDisplayName(
      input.displayName,
      defaultRemoteAgentName(input.agent),
    ),
  );
  const profile = input.identity.minted
    ? await signMintedProfileIfPresent(
        input.signMintedProfile,
        input.agent.id,
        name,
        input.identity.pubkey,
        true,
      )
    : null;
  const next = await installCommunityBot(
    input.current,
    {
      id: input.agent.id,
      name,
      pubkey: input.identity.pubkey,
      source: "openclaw",
    },
    input.relayUrl,
  );
  if (profile) {
    await publishCommunityBotProfile(profile);
  }
  return next;
}

export async function completeCommunityBotRename(input: {
  current: ReadonlyArray<CommunityBot>;
  bot: CommunityBot;
  displayName: string;
  relayUrl: string;
  signMintedProfile: SignMintedCommunityBotProfile;
}): Promise<CommunityBot[]> {
  const name = assertValidCommunityBotDisplayName(
    normalizeCommunityBotDisplayName(input.displayName, input.bot.id),
  );
  const profile = await signMintedProfileIfPresent(
    input.signMintedProfile,
    input.bot.id,
    name,
    input.bot.pubkey,
    false,
  );
  const next = upsertInstalledBot(input.current, { ...input.bot, name });
  await publishCommunityBots(next, input.relayUrl);
  if (profile) {
    await publishCommunityBotProfile(profile);
  }
  return next;
}
