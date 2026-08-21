export const PLAYGROUND_HULA = "playground";
export const PLAYGROUND_VERSION = 1;

export type PlaygroundCard = {
  hula: typeof PLAYGROUND_HULA;
  v: typeof PLAYGROUND_VERSION;
  name: string;
  url: string;
  pin?: string;
  sid: string;
  stack?: string;
  expires?: string | number;
};

/** Present PIN text, or null when the card omitted / emptied it. */
export function playgroundPin(
  value: { pin?: string | null } | string | null | undefined,
): string | null {
  const pin = typeof value === "string" ? value : (value?.pin ?? "");
  const trimmed = pin.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type PlaygroundProbeResult = {
  up: boolean;
  status?: number | null;
  message?: string | null;
};

export type PlaygroundWebviewBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PlaygroundInspectResult = {
  webviewId: string;
};

export type PlaygroundNavState = {
  sid: string;
  canGoBack: boolean;
  canGoForward: boolean;
  currentUrl: string;
};

export type PlaygroundPollResult = {
  changed: boolean;
};

export type PlaygroundScreenshotPayload = {
  bytes: number[];
  mime: string;
  filename: string;
};

export const PLAYGROUND_APP_WEBVIEW_ID = "main";
export const PLAYGROUND_WEBVIEW_PREFIX = "playground-";

export const DESKTOP_STAGE_PRESETS = [375, 390, 768, 1024, 1280, 1440] as const;

export const MIN_PLAYGROUND_WEBVIEW_EDGE = 32;
export const DEFAULT_RESPONSIVE_VIEWPORT = { width: 390, height: 844 };
