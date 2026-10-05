import { attachManagedAgentToChannel } from "@/features/agents/channelAgents";
import { fetchCommunityBots } from "@/features/community-bots/lib/catalog";
import { communityBotAddMemberInput } from "@/features/community-bots/lib/addCandidates";
import { requireProjectCodingAgent } from "@/features/projects/lib/projectCodingAgent";
import {
  addChannelMembers,
  getChannelMembers,
  listManagedAgents,
} from "@/shared/api/tauri";
import { normalizePubkey } from "@/shared/lib/pubkey";

/**
 * Confirm the pubkey is a local managed bot or a community bot.
 * Human members are neither, so they cannot be saved as the coding agent.
 * Returns the lowercase pubkey.
 */
export async function requireKnownCodingAgent(pubkey: string): Promise<string> {
  const normalized = requireProjectCodingAgent(pubkey);
  const [agents, bots] = await Promise.all([
    listManagedAgents(),
    fetchCommunityBots(),
  ]);
  const local = agents.some(
    (agent) =>
      agent.backend.type === "local" &&
      normalizePubkey(agent.pubkey) === normalized,
  );
  if (local) return normalized;
  const community = bots.some(
    (bot) => normalizePubkey(bot.pubkey) === normalized,
  );
  if (community) return normalized;
  throw new Error("Choose a local bot or community bot.");
}

/**
 * Put that bot on the project channel without publishing a project event.
 * An existing member is left in place. A local bot is attached and started
 * the same way create does. A community bot joins with the bot role.
 */
export async function ensureProjectCodingAgentMember(
  channelId: string,
  pubkey: string,
): Promise<string> {
  const normalized = await requireKnownCodingAgent(pubkey);
  const [agents, members] = await Promise.all([
    listManagedAgents(),
    getChannelMembers(channelId, { readYourWrites: true }),
  ]);
  const alreadyMember = members.some(
    (member) => normalizePubkey(member.pubkey) === normalized,
  );
  if (alreadyMember) return normalized;

  const local = agents.find(
    (agent) =>
      agent.backend.type === "local" &&
      normalizePubkey(agent.pubkey) === normalized,
  );
  if (local) {
    await attachManagedAgentToChannel(channelId, {
      agent: local,
      role: "bot",
    });
    return normalized;
  }

  const result = await addChannelMembers({
    channelId,
    ...communityBotAddMemberInput(normalized),
  });
  const membershipError = result.errors.find(
    (error) => normalizePubkey(error.pubkey) === normalized,
  );
  if (membershipError) {
    throw new Error(membershipError.error);
  }
  return normalized;
}
