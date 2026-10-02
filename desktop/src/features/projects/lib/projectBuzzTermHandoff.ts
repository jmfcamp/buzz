import { isActiveLocalManagedAgent } from "@/features/browser-agent/lib/grantAgentRoster";
import { untrustedPromptValue } from "@/features/projects/lib/projectDetailAgentContext";
import type { ManagedAgent } from "@/shared/api/types";

const OPEN_TITLE = "Open this place in Buzz Term";

export type ProjectBuzzTermPlace = {
  projectName: string;
  repositoryName: string;
  openClawPath?: string | null;
  branch?: string | null;
  view: string;
  file?: { kind: "file" | "folder"; path: string } | null;
  selection?:
    | readonly {
        id: string;
        kind: string;
        title: string;
      }[]
    | null;
  workItem?: {
    id: string;
    kind: string;
    status?: string;
    title: string;
  } | null;
};

export type ProjectBuzzTermAgent = {
  name: string;
  pubkey: string;
};

/**
 * Buzz Term edits the OpenClaw checkout. A viewed branch or tag that is not
 * that checkout cannot launch.
 */
export function projectBuzzTermLaunchAllowed(input: {
  openClaw: boolean;
  viewedBranch?: string | null;
  checkedOutBranch?: string | null;
  selectedTag?: string | null;
}): { allowed: boolean; title: string } {
  if (!input.openClaw) return { allowed: true, title: OPEN_TITLE };
  const checkedOut = input.checkedOutBranch?.trim() ?? "";
  const viewed = input.viewedBranch?.trim() ?? "";
  const onCheckout =
    !input.selectedTag?.trim() &&
    checkedOut.length > 0 &&
    viewed === checkedOut;
  if (onCheckout) return { allowed: true, title: OPEN_TITLE };
  if (checkedOut) {
    return {
      allowed: false,
      title: `Buzz Term uses the checked-out branch (${checkedOut}).`,
    };
  }
  return {
    allowed: false,
    title: "Buzz Term is available on the checked-out branch.",
  };
}

/**
 * Running local agents. An OpenClaw checkout only lists agents whose
 * OpenClaw workspace MCP is enabled.
 */
export function filterProjectBuzzTermAgents<
  T extends Pick<ManagedAgent, "backend" | "status" | "useOpenClawWorkspace">,
>(agents: readonly T[], openClawOnly: boolean): T[] {
  return agents.filter((agent) => {
    if (!isActiveLocalManagedAgent(agent)) return false;
    if (openClawOnly && agent.useOpenClawWorkspace !== true) return false;
    return true;
  });
}

export function projectBuzzTermAgentEmptyLabel(openClaw: boolean): string {
  return openClaw
    ? "No running local agents with OpenClaw enabled"
    : "No running local agents";
}

/** Prompt seeded into Buzz Term for the place the project screen is showing. */
export function buildProjectBuzzTermPrompt(
  place: ProjectBuzzTermPlace,
  agent?: ProjectBuzzTermAgent | null,
): string {
  const openClawPath = place.openClawPath?.trim() ?? "";
  const lines = [
    openClawPath
      ? "Work on this OpenClaw checkout. Use the OpenClaw workspace tools. Do not check out another branch."
      : "Work on this repository checkout.",
    "",
    `Project: ${untrustedPromptValue(place.projectName)}`,
    `Repository: ${untrustedPromptValue(place.repositoryName)}`,
  ];
  if (openClawPath) {
    lines.push(`OpenClaw path: ${untrustedPromptValue(openClawPath, 400)}`);
  }
  if (place.branch?.trim()) {
    lines.push(`Branch: ${untrustedPromptValue(place.branch.trim())}`);
  }
  lines.push(`Place: ${untrustedPromptValue(place.view || "Project")}`);
  if (place.file?.path) {
    const label = place.file.kind === "folder" ? "Folder" : "File";
    lines.push(`${label}: ${untrustedPromptValue(place.file.path, 400)}`);
  }
  if (place.workItem) {
    const kind =
      place.workItem.kind.length > 0
        ? `${place.workItem.kind[0]?.toUpperCase() ?? ""}${place.workItem.kind.slice(1)}`
        : "Item";
    lines.push(
      `${kind}: ${untrustedPromptValue(place.workItem.title)} (${untrustedPromptValue(place.workItem.id, 200)})`,
    );
    if (place.workItem.status?.trim()) {
      lines.push(`Status: ${untrustedPromptValue(place.workItem.status)}`);
    }
  }
  const selection = place.selection ?? [];
  if (selection.length > 0) {
    lines.push("Selection:");
    for (const item of selection.slice(0, 8)) {
      lines.push(
        `- ${item.kind}: ${untrustedPromptValue(item.title)} (${untrustedPromptValue(item.id, 200)})`,
      );
    }
    if (selection.length > 8) {
      lines.push(`- ${selection.length - 8} more selected items.`);
    }
  }
  const agentName = agent?.name.trim() ?? "";
  const agentPubkey = agent?.pubkey.trim() ?? "";
  if (agentName || agentPubkey) {
    lines.push(
      `Local agent: ${untrustedPromptValue(agentName || agentPubkey)} (${untrustedPromptValue(agentPubkey || agentName, 200)})`,
    );
  }
  return lines.join("\n");
}
