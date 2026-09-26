import { invoke, isTauri } from "@tauri-apps/api/core";

import type { PlaygroundScreenshotPayload } from "@/features/playground/lib/types";

/**
 * Refresh cadence for Browsers list thumbnails. WKWebView takeSnapshot is
 * cheap enough for a short interval; avoid sub-second polling.
 */
export const BROWSER_PREVIEW_REFRESH_MS = 4_000;

/** Byte length of Rust `empty_png()` (1×1 transparent) used as non-macOS stub. */
export const EMPTY_PREVIEW_PNG_BYTE_LENGTH = 68;

export function isUsablePreviewPng(bytes: ArrayLike<number>): boolean {
  return bytes.length > EMPTY_PREVIEW_PNG_BYTE_LENGTH;
}

export function previewBytesToDataUrl(
  bytes: number[],
  mime = "image/png",
): string {
  const binary = Uint8Array.from(bytes);
  let raw = "";
  for (let i = 0; i < binary.length; i += 1) {
    raw += String.fromCharCode(binary[i] ?? 0);
  }
  return `data:${mime};base64,${btoa(raw)}`;
}

function isNativeRuntime(): boolean {
  return isTauri() || import.meta.env.MODE === "e2e";
}

/**
 * Snapshot a playground webview for the Browsers list preview.
 * Passes an explicit `windowLabel` so detached OS/embed hosts capture the
 * correct child label (does not use the caller's current-window default).
 * Captures the **visible viewport** at native WKWebView pixel size (default
 * snapshot config — no `snapshotWidth` override, no full-page height expand).
 * The thumb UI letterboxes with `object-contain` (never `object-cover`).
 *
 * Cadence: callers should poll about every {@link BROWSER_PREVIEW_REFRESH_MS}.
 * Limitations: real pixels on macOS WKWebView only; other platforms get the
 * empty stub PNG (treated as failure → placeholder). Fails soft when the
 * webview is not open yet. Requires a desktop (cargo/tauri) rebuild when
 * Rust capture.rs changes — Vite alone will not pick them up (`just desktop-standalone`).
 */
export async function captureBrowserPreview(input: {
  sid: string;
  windowLabel: string;
}): Promise<string | null> {
  if (!isNativeRuntime()) return null;
  try {
    const result = await invoke<PlaygroundScreenshotPayload>(
      "playground_webview_screenshot",
      {
        sid: input.sid,
        windowLabel: input.windowLabel,
        fullPage: false,
      },
    );
    if (!isUsablePreviewPng(result.bytes)) return null;
    return previewBytesToDataUrl(result.bytes, result.mime || "image/png");
  } catch {
    return null;
  }
}

/** Hostname for muted favicon fallback; null when URL is unusable. */
export function browserPreviewFaviconHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return null;
    return parsed.hostname;
  } catch {
    return null;
  }
}
