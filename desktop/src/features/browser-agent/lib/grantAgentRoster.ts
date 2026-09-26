import { isManagedAgentActive } from "@/features/agents/lib/managedAgentControlActions";
import type { ManagedAgent } from "@/shared/api/types";

/**
 * Observe/Drive can only bind Desktop-managed local ACP agents (not remote-only
 * Gateway / provider backends). Aligns “running” with sidebar Agents X/Y via
 * {@link isManagedAgentActive} (`running` | `deployed`).
 */
export function isActiveLocalManagedAgent(
  agent: Pick<ManagedAgent, "status" | "backend">,
): boolean {
  return agent.backend.type === "local" && isManagedAgentActive(agent);
}

/** Roster for the grant / Bot chrome agent picker. */
export function filterActiveLocalManagedAgents<
  T extends Pick<ManagedAgent, "status" | "backend">,
>(agents: readonly T[]): T[] {
  return agents.filter(isActiveLocalManagedAgent);
}

export const NO_RUNNING_LOCAL_AGENTS_LABEL = "No running local agents";
