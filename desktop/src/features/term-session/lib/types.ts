export const TERM_SESSION_HULA = "term-session";
export const TERM_SESSION_VERSION = 1;

export type TermSessionTool = "claude" | "codex";

export type TermSessionCard = {
  hula: typeof TERM_SESSION_HULA;
  v: typeof TERM_SESSION_VERSION;
  name: string;
  tool: TermSessionTool;
  sid: string;
  cwd?: string;
  prompt: string;
  summary?: string;
  /** Boolean only — never embed grant/JWT secrets. */
  openclawWorkspace?: boolean;
};

export const TERM_SESSION_TOOLS: readonly TermSessionTool[] = [
  "claude",
  "codex",
] as const;

export function isTermSessionTool(value: unknown): value is TermSessionTool {
  return value === "claude" || value === "codex";
}
