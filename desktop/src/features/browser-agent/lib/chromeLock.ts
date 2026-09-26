import type { BrowserAgentGrant } from "./types";

/** Tooltip / title when chrome nav or viewport is locked under Drive. */
export const AGENT_DRIVING_CHROME_TOOLTIP = "Agent is driving";

/**
 * True when the agent owns page + chrome that must stay stable for Drive:
 * Drive grant and the human has not Taken control.
 *
 * Shared by: Back / Forward / Refresh / URL, Desktop|Responsive|Mobile,
 * resolution inputs, mobile museum scale/device/orientation, and (in-page)
 * human wheel/touch/keyboard scroll via `#__buzz_agent_lock`.
 * Observe / Off / Take-control leave these unlocked.
 */
export function isAgentDrivingChromeLocked(
  grant: BrowserAgentGrant | null | undefined,
): boolean {
  return grant?.mode === "drive" && !grant.userHasControl;
}
