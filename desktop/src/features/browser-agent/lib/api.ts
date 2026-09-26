import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type {
  BrowserAgentGrant,
  DriveAction,
  GrantSetInput,
  ObservePollResult,
} from "./types";

function native(): boolean {
  return isTauri() || import.meta.env.MODE === "e2e";
}

function windowLabel(): string {
  if (!isTauri()) return "main";
  try {
    return getCurrentWindow().label || "main";
  } catch {
    return "main";
  }
}

export async function setBrowserAgentGrant(
  input: GrantSetInput,
): Promise<BrowserAgentGrant> {
  if (!native()) {
    return {
      webviewLabel: `${input.surface}-${input.surfaceId}`,
      surface: input.surface,
      surfaceId: input.surfaceId,
      agentId: input.agentId,
      agentPubkey: input.agentPubkey,
      channelId: input.channelId,
      threadRoot: input.threadRoot ?? null,
      mode: input.mode,
      createdAtMs: Date.now(),
    };
  }
  return invoke<BrowserAgentGrant>("browser_agent_grant_set", {
    input: {
      ...input,
      windowLabel: input.windowLabel ?? windowLabel(),
    },
  });
}

export async function clearBrowserAgentGrant(
  webviewLabel: string,
): Promise<void> {
  if (!native()) return;
  await invoke("browser_agent_grant_clear", { webviewLabel });
}

export async function getBrowserAgentGrant(
  webviewLabel: string,
): Promise<BrowserAgentGrant | null> {
  if (!native()) return null;
  return invoke<BrowserAgentGrant | null>("browser_agent_grant_get", {
    webviewLabel,
  });
}

export async function takeBrowserAgentControl(
  webviewLabel: string,
): Promise<void> {
  if (!native()) return;
  await invoke("browser_agent_take_control", { webviewLabel });
}

export async function pollBrowserObserve(input: {
  webviewLabel: string;
  agentPubkey: string;
  afterId?: number;
  limit?: number;
}): Promise<ObservePollResult> {
  if (!native()) {
    throw new Error("browser observe requires native runtime");
  }
  return invoke<ObservePollResult>("browser_observe_poll", {
    input: {
      webviewLabel: input.webviewLabel,
      agentPubkey: input.agentPubkey,
      afterId: input.afterId ?? 0,
      limit: input.limit ?? 50,
    },
  });
}

export async function browserDrive(input: {
  webviewLabel: string;
  agentPubkey: string;
  action: DriveAction;
}): Promise<{ ok: boolean; message?: string | null }> {
  if (!native()) {
    throw new Error("browser drive requires native runtime");
  }
  return invoke("browser_drive", {
    input: {
      webviewLabel: input.webviewLabel,
      agentPubkey: input.agentPubkey,
      action: input.action,
      windowLabel: windowLabel(),
    },
  });
}

export function subscribeBrowserAgentGrant(
  onChange: (payload: {
    webviewLabel: string;
    grant: BrowserAgentGrant | null;
  }) => void,
): Promise<() => void> {
  if (!native()) return Promise.resolve(() => undefined);
  return listen<{ webviewLabel: string; grant: BrowserAgentGrant | null }>(
    "browser-agent-grant",
    (event) => onChange(event.payload),
  );
}
