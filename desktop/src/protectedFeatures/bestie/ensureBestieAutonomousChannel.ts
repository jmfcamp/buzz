import { attachManagedAgentToChannel } from "@/features/agents/channelAgents";
import { createChannel } from "@/shared/api/tauriChannels";
import type { Channel, ManagedAgent } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

import {
  BESTIE_AUTONOMOUS_CHANNEL_DESCRIPTION,
  BESTIE_AUTONOMOUS_CHANNEL_NAME,
  findBestieAutonomousChannel,
} from "./bestieAutonomousChannel";
import {
  readBestieAutonomousChannelId,
  writeBestieAutonomousChannelId,
  type BestieAutonomousChannelScope,
} from "./bestieAutonomousChannelStorage";

export type EnsureBestieAutonomousChannelInput = {
  agent: ManagedAgent;
  channels: readonly Channel[];
  scope: BestieAutonomousChannelScope;
};

/**
 * Resolve (or create) the private `#bestie-jobs` stream and ensure the Bestie
 * agent is a bot member. Idempotent; safe to call on every autonomous turn.
 */
export async function ensureBestieAutonomousChannel(
  input: EnsureBestieAutonomousChannelInput,
): Promise<Channel> {
  const agentPubkey = normalizePubkey(input.agent.pubkey);
  const storedId = readBestieAutonomousChannelId(input.scope);
  const existing = findBestieAutonomousChannel(input.channels, {
    agentPubkey,
    storedChannelId: storedId,
  });
  if (existing) {
    writeBestieAutonomousChannelId(input.scope, existing.id);
    return existing;
  }

  const created = await createChannel({
    channelType: "stream",
    description: BESTIE_AUTONOMOUS_CHANNEL_DESCRIPTION,
    name: BESTIE_AUTONOMOUS_CHANNEL_NAME,
    visibility: "private",
  });

  await attachManagedAgentToChannel(created.id, {
    agent: input.agent,
    ensureRunning: false,
    role: "bot",
  });

  const withAgent: Channel = {
    ...created,
    memberCount: Math.max(
      created.memberCount,
      created.memberPubkeys.length + 1,
    ),
    memberPubkeys: Array.from(
      new Set([
        ...created.memberPubkeys.map(normalizePubkey),
        normalizePubkey(input.scope.ownerPubkey),
        agentPubkey,
      ]),
    ),
  };

  writeBestieAutonomousChannelId(input.scope, withAgent.id);
  return withAgent;
}
