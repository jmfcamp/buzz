import { invokeTauri } from "@/shared/api/tauri";

import { buildTermSessionLaunchCommand } from "./launchCommand.ts";
import type { TermSessionCard } from "./types.ts";
import { getTermSessionPrompt } from "./promptStore.ts";

export type PrepareTermSessionLaunchResult = {
  promptPath: string;
  /** Legacy (desktop ≤ hula.8): per-sid CLAUDE_CONFIG_DIR. Newer desktops return null. */
  claudeConfigDir: string | null;
  /** Per-sid MCP JSON passed via `claude --mcp-config` (keeps the user's Claude login). */
  mcpConfigPath?: string | null;
  /** Standing instructions were prepended into the prompt file when true. */
  openclawWired: boolean;
  /** `{app_data}/user-signer` when buzz-dev-mcp was wired for user IPC. */
  userSignerDir?: string | null;
  buzzDevMcpWired?: boolean;
};

/**
 * Write the handoff prompt under app data; for Claude, upsert stdio
 * buzz-dev-mcp with BUZZ_USER_SIGNER_DIR (Desktop IPC signer). When
 * `openclawWorkspace` is set, also upsert OpenClaw HTTP MCP (grant reuse).
 */
export async function prepareTermSessionLaunch(
  card: TermSessionCard,
): Promise<PrepareTermSessionLaunchResult> {
  const prompt = getTermSessionPrompt(card.sid) ?? card.prompt;
  return invokeTauri<PrepareTermSessionLaunchResult>(
    "prepare_term_session_launch",
    {
      input: {
        sid: card.sid,
        tool: card.tool,
        prompt,
        cwd: card.cwd ?? null,
        openclawWorkspace: card.openclawWorkspace === true,
      },
    },
  );
}

export function buildLaunchFromPrepare(
  card: TermSessionCard,
  prepared: PrepareTermSessionLaunchResult,
): {
  launchCommand: string;
  extraEnv: Record<string, string>;
} {
  const extraEnv: Record<string, string> = {};
  // Never export CLAUDE_CONFIG_DIR: it hides the user's Claude login and forces
  // a fresh sign-in. MCP wiring rides on --mcp-config instead.
  const mcpConfigPath =
    prepared.mcpConfigPath ??
    (prepared.claudeConfigDir ? `${prepared.claudeConfigDir.replace(/\/+$/, "")}/.claude.json` : null);
  // Also expose the IPC dir on the PTY for shell debugging / non-Claude tools.
  // Contains no secrets — only the request/response directory path.
  if (prepared.userSignerDir) {
    extraEnv.BUZZ_USER_SIGNER_DIR = prepared.userSignerDir;
  }
  return {
    launchCommand: buildTermSessionLaunchCommand({
      tool: card.tool,
      promptPath: prepared.promptPath,
      cwd: card.cwd,
      mcpConfigPath,
    }),
    extraEnv,
  };
}
