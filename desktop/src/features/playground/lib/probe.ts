import { invoke, isTauri } from "@tauri-apps/api/core";

import type { PlaygroundProbeResult } from "./types.ts";
import { isAllowedPlaygroundUrl } from "./url.ts";

export async function probePlaygroundUrl(
  url: string,
): Promise<PlaygroundProbeResult> {
  if (!isAllowedPlaygroundUrl(url)) {
    return { up: false, message: "Playground URL is not allowed." };
  }
  if (import.meta.env.MODE === "test") {
    const stub = (
      globalThis as {
        __BUZZ_PLAYGROUND_PROBE__?: (
          nextUrl: string,
        ) => PlaygroundProbeResult | Promise<PlaygroundProbeResult>;
      }
    ).__BUZZ_PLAYGROUND_PROBE__;
    if (stub) {
      return stub(url);
    }
  }
  if (!isTauri() && import.meta.env.MODE !== "e2e") {
    return {
      up: false,
      message: "Playground probe requires the desktop app.",
    };
  }
  return invoke<PlaygroundProbeResult>("playground_probe", { url });
}
