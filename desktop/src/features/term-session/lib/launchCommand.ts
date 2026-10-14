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
  /**
   * Per-sid MCP JSON for Claude (`--mcp-config`). Preferred over
   * claudeConfigDir: keeps the user's normal Claude login (~/.claude + keychain).
   */
  mcpConfigPath?: string | null;
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
  const mcp =
    input.tool === "claude" && input.mcpConfigPath?.trim()
      ? // `--mcp-config` is variadic: the `=` form plus `--` stop it from swallowing the prompt as a second config path.
        ` --mcp-config=${shellSingleQuote(input.mcpConfigPath.trim())} --`
      : "";
  const launch = `${toolBin}${mcp} ${readPrompt}`;

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

/**
 * Older desktops (≤ hula.8) hand back `export CLAUDE_CONFIG_DIR='<sid dir>' && … claude "…"`. That per-session config dir
 * hides the user's Claude login (~/.claude + keychain) and forces a fresh sign-in. Rewrite it to keep the normal login and
 * load the same per-session MCP servers with `--mcp-config '<sid dir>/.claude.json'`. Other lines pass through unchanged.
 */
export function keepUserClaudeLogin(launchCommand: string): string {
  // Lines from build mv7o3fpu used the space form, which let the variadic flag swallow the prompt; normalise those too.
  const fixed = launchCommand.replace(/(^|&& )claude --mcp-config ('(?:[^']|'"'"')*') "/, '$1claude --mcp-config=$2 -- "');
  const m = /(?:^|&& )export CLAUDE_CONFIG_DIR=('(?:[^']|'"'"')*') && /.exec(fixed);
  if (!m) return fixed;
  const dir = m[1].slice(1, -1).replace(/'"'"'/g, "'").replace(/\/+$/, "");
  const stripped = fixed.replace(m[0], m[0].startsWith("&& ") ? "&& " : "");
  if (/(^|&& )claude --mcp-config=/.test(stripped)) return stripped;
  return stripped.replace(/(^|&& )claude "/, `$1claude --mcp-config=${shellSingleQuote(`${dir}/.claude.json`)} -- "`);
}
