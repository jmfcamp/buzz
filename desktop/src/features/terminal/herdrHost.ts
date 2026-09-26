import { invoke, isTauri } from "@tauri-apps/api/core";

import { getTermPreferences } from "./termPreferences.ts";

export type HerdrOpenRequest = {
  cwd?: string | null;
  /** Shell line to run in the new herdr pane after create (card Open only). */
  command?: string | null;
  label?: string | null;
  env?: Record<string, string>;
  /**
   * Named herdr session (`herdr session attach <name>` / `--session`).
   * Omit to use Settings → Buzz Term → Session name (default `buzz`).
   * Blank string targets herdr's unnamed default session.
   */
  sessionName?: string | null;
  /**
   * When true, create a focused herdr workspace (term-session card Open only).
   * Plain Buzz Term open must omit / pass false — attach only, no create.
   */
  createWorkspace?: boolean;
};

export type HerdrOpenResult =
  | {
      ok: true;
      herdrBin: string;
      sessionName: string;
      attachArgv: string[];
      workspaceId?: string;
      tabId?: string;
      paneId?: string;
    }
  | { ok: false; reason: string };


/** herdr workspace --label: display channel name, plus :threadId when in a thread. */
export function herdrWorkspaceLabel(
  channelName: string,
  threadId: string | null | undefined,
): string {
  const name = channelName.trim() || "channel";
  const thread = threadId?.trim();
  return thread ? `${name}:${thread}` : name;
}

/** Probe whether the herdr CLI + server are usable. */
export async function isHerdrAvailable(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    return await invoke<boolean>("term_herdr_available");
  } catch {
    return false;
  }
}

/**
 * Ensure the herdr session server is running. Pass `createWorkspace: true`
 * only from term-session card Open to create a focused workspace + optional
 * handoff command. Never opens Terminal.app — callers attach in-app via
 * `herdrBin` + `attachArgv`.
 */
export async function openInHerdr(
  request: HerdrOpenRequest,
): Promise<HerdrOpenResult> {
  if (!isTauri()) {
    return { ok: false, reason: "herdr requires Buzz Desktop" };
  }
  const sessionName =
    request.sessionName !== undefined && request.sessionName !== null
      ? String(request.sessionName).trim()
      : getTermPreferences().sessionName;
  try {
    return await invoke<HerdrOpenResult>("term_open_in_herdr", {
      request: { ...request, sessionName },
    });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Prefer herdr when Settings says so and herdr is available; otherwise
 * callers fall back to in-app Buzz Term.
 */
export async function shouldOpenInHerdr(): Promise<boolean> {
  if (getTermPreferences().sessionHost !== "herdr") return false;
  return isHerdrAvailable();
}

/** Stable key for reusing one in-app herdr-attach PTY per session name. */
export function herdrAttachKey(sessionName: string): string {
  return sessionName.trim();
}
