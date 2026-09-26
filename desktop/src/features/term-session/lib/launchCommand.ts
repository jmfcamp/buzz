import type { TermSessionTool } from "./types.ts";

/** Shell-escape a single argument for POSIX `sh` / bash (single quotes). */
export function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

export type BuildTermSessionLaunchCommandInput = {
  tool: TermSessionTool;
  /** Absolute path to the prompt file written under app data. */
  promptPath: string;
  /** Optional working directory (absolute or ~). */
  cwd?: string | null;
  /**
   * When set, export CLAUDE_CONFIG_DIR before launching Claude so interactive
   * Claude picks up the per-sid OpenClaw MCP config.
   */
  claudeConfigDir?: string | null;
};

/**
 * Build a shell line that launches the interactive CLI with the handoff prompt.
 *
 * Claude: `claude "$(cat prompt)"` seeds an interactive session (not `-p`).
 * Codex: `codex "$(cat prompt)"` seeds the interactive TUI.
 * Neither uses the ACP adapter binaries.
 */
export function buildTermSessionLaunchCommand(
  input: BuildTermSessionLaunchCommandInput,
): string {
  const promptPath = shellSingleQuote(input.promptPath);
  const readPrompt = `"$(cat ${promptPath})"`;
  const toolBin = input.tool === "claude" ? "claude" : "codex";
  const launch = `${toolBin} ${readPrompt}`;

  const parts: string[] = [];
  if (input.tool === "claude" && input.claudeConfigDir?.trim()) {
    parts.push(
      `export CLAUDE_CONFIG_DIR=${shellSingleQuote(input.claudeConfigDir.trim())}`,
    );
  }
  if (input.cwd?.trim()) {
    parts.push(`cd ${shellSingleQuote(input.cwd.trim())}`);
  }
  parts.push(launch);
  return parts.join(" && ");
}
