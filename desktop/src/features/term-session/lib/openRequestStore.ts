import type { TermSessionTool } from "./types.ts";

export type TermSessionOpenRequest = {
  sid: string;
  channelId: string;
  channelName: string;
  threadId: string | null;
  tool: TermSessionTool;
  cwd?: string | null;
  /** Absolute prompt file path from prepare_term_session_launch. */
  promptPath: string;
  /** Shell command to type into the PTY after attach. */
  launchCommand: string;
  /** Optional env injected at PTY spawn (e.g. CLAUDE_CONFIG_DIR). */
  extraEnv?: Record<string, string>;
  /** Generation bumps so identical sid re-opens still notify listeners. */
  generation: number;
};

let generation = 0;
let pending: TermSessionOpenRequest | null = null;
const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) listener();
}

export function requestTermSessionOpen(
  request: Omit<TermSessionOpenRequest, "generation">,
) {
  generation += 1;
  pending = { ...request, generation };
  publish();
}

export function consumeTermSessionOpenRequest(): TermSessionOpenRequest | null {
  const next = pending;
  pending = null;
  return next;
}

export function getTermSessionOpenRequest(): TermSessionOpenRequest | null {
  return pending;
}

export function subscribeTermSessionOpenRequest(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** sid → live TerminalBootstrap session key for re-attach / focus. */
const liveBySid = new Map<string, string>();

export function noteTermSessionLive(sid: string, sessionKey: string) {
  liveBySid.set(sid, sessionKey);
}

export function clearTermSessionLive(sid: string) {
  liveBySid.delete(sid);
}

export function getTermSessionLiveKey(sid: string): string | null {
  return liveBySid.get(sid) ?? null;
}

export function resetTermSessionOpenStoreForTests() {
  pending = null;
  generation = 0;
  liveBySid.clear();
}
