import { isActiveLocalManagedAgent } from "@/features/browser-agent/lib/grantAgentRoster";
import type { ManagedAgent } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

/**
 * Local managed agents that are channel members and currently active
 * (`running` | `deployed`), matching Observe/Drive roster policy.
 */
export function filterTermSessionHandoffAgents<
  T extends Pick<ManagedAgent, "pubkey" | "status" | "backend" | "name">,
>(agents: readonly T[], channelMemberPubkeys: readonly string[]): T[] {
  const members = new Set(
    channelMemberPubkeys.map((pubkey) => normalizePubkey(pubkey)),
  );
  return agents.filter(
    (agent) =>
      isActiveLocalManagedAgent(agent) &&
      members.has(normalizePubkey(agent.pubkey)),
  );
}

export const NO_HANDOFF_AGENTS_LABEL =
  "No running local agents in this channel";
