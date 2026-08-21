import { invoke, isTauri } from "@tauri-apps/api/core";

import {
  MIN_PLAYGROUND_WEBVIEW_EDGE,
  PLAYGROUND_APP_WEBVIEW_ID,
  PLAYGROUND_WEBVIEW_PREFIX,
  type PlaygroundInspectResult,
  type PlaygroundWebviewBounds,
} from "./types.ts";

function isNativePlaygroundRuntime(): boolean {
  return isTauri() || import.meta.env.MODE === "e2e";
}

async function invokePlayground<T>(
  command: string,
  args: Record<string, unknown>,
  fallback: T,
): Promise<T> {
  if (!isNativePlaygroundRuntime()) {
    return fallback;
  }
  return invoke<T>(command, args);
}

export function playgroundWebviewId(sid: string): string {
  return `${PLAYGROUND_WEBVIEW_PREFIX}${sid}`;
}

export function isPlaygroundInspectTarget(webviewId: string): boolean {
  return (
    webviewId.startsWith(PLAYGROUND_WEBVIEW_PREFIX) &&
    webviewId !== PLAYGROUND_APP_WEBVIEW_ID
  );
}

export function playgroundWebviewBoundsAreUsable(
  bounds: PlaygroundWebviewBounds,
): boolean {
  return (
    bounds.width >= MIN_PLAYGROUND_WEBVIEW_EDGE &&
    bounds.height >= MIN_PLAYGROUND_WEBVIEW_EDGE
  );
}

export async function showPlaygroundWebview(input: {
  sid: string;
  url: string;
  bounds: PlaygroundWebviewBounds;
}): Promise<void> {
  await invokePlayground(
    "playground_webview_show",
    { sid: input.sid, url: input.url, bounds: input.bounds },
    undefined,
  );
}

export async function hidePlaygroundWebview(sid: string): Promise<void> {
  await invokePlayground("playground_webview_hide", { sid }, undefined);
}

export async function hideAllPlaygroundWebviews(): Promise<void> {
  if (!isNativePlaygroundRuntime()) return;
  await invoke("playground_webview_hide_all");
}

export async function setPlaygroundWebviewBounds(
  sid: string,
  bounds: PlaygroundWebviewBounds,
): Promise<void> {
  await invokePlayground(
    "playground_webview_set_bounds",
    { sid, bounds },
    undefined,
  );
}

export async function closePlaygroundWebview(sid: string): Promise<void> {
  if (!isNativePlaygroundRuntime()) return;
  await invoke("playground_webview_close", { sid });
}

export async function closeAllPlaygroundWebviews(): Promise<void> {
  if (!isNativePlaygroundRuntime()) return;
  await invoke("playground_webview_close_all");
}

export async function inspectPlaygroundWebview(
  sid: string,
): Promise<PlaygroundInspectResult> {
  const fallback = { webviewId: playgroundWebviewId(sid) };
  const result = await invokePlayground(
    "playground_webview_inspect",
    { sid },
    fallback,
  );
  if (!isPlaygroundInspectTarget(result.webviewId)) {
    throw new Error("Inspect must target the playground webview.");
  }
  return result;
}
