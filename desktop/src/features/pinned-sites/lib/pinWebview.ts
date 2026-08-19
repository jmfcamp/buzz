import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type PinWebviewBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PinWebviewNavState = {
  canGoBack: boolean;
  canGoForward: boolean;
  currentUrl: string;
};

export type PinWebviewPollResult = {
  changed: boolean;
};

export type PinWebviewLoadState = {
  pinId: string;
  url: string;
  ok: boolean;
  status?: number | null;
  message?: string | null;
};

/** Logical px. A 1×1 first layout must not create the child webview. */
export const MIN_PIN_WEBVIEW_EDGE = 32;

const EMPTY_NAV: PinWebviewNavState = {
  canGoBack: false,
  canGoForward: false,
  currentUrl: "",
};

export function pinWebviewBoundsAreUsable(bounds: PinWebviewBounds): boolean {
  return (
    bounds.width >= MIN_PIN_WEBVIEW_EDGE &&
    bounds.height >= MIN_PIN_WEBVIEW_EDGE
  );
}

function isNativePinRuntime(): boolean {
  return isTauri() || import.meta.env.MODE === "e2e";
}

async function invokePin<T>(
  command: string,
  args: Record<string, unknown>,
  fallback: T,
): Promise<T> {
  if (!isNativePinRuntime()) {
    return fallback;
  }
  return invoke<T>(command, args);
}

export async function showPinWebview(input: {
  pinId: string;
  startUrl: string;
  bounds: PinWebviewBounds;
}): Promise<PinWebviewNavState> {
  return invokePin(
    "pin_webview_show",
    {
      pinId: input.pinId,
      startUrl: input.startUrl,
      bounds: input.bounds,
    },
    {
      ...EMPTY_NAV,
      currentUrl: input.startUrl,
    },
  );
}

export async function hidePinWebview(pinId: string): Promise<void> {
  await invokePin("pin_webview_hide", { pinId }, undefined);
}

export async function hideAllPinWebviews(): Promise<void> {
  if (!isNativePinRuntime()) return;
  await invoke("pin_webview_hide_all");
}

export async function setPinWebviewBounds(
  pinId: string,
  bounds: PinWebviewBounds,
): Promise<void> {
  await invokePin("pin_webview_set_bounds", { pinId, bounds }, undefined);
}

export async function pinWebviewGoBack(
  pinId: string,
): Promise<PinWebviewNavState> {
  return invokePin("pin_webview_go_back", { pinId }, EMPTY_NAV);
}

export async function pinWebviewGoForward(
  pinId: string,
): Promise<PinWebviewNavState> {
  return invokePin("pin_webview_go_forward", { pinId }, EMPTY_NAV);
}

export async function pinWebviewReload(pinId: string): Promise<void> {
  await invokePin("pin_webview_reload", { pinId }, undefined);
}

export async function getPinWebviewNavState(
  pinId: string,
): Promise<PinWebviewNavState> {
  try {
    return await invokePin("pin_webview_nav_state", { pinId }, EMPTY_NAV);
  } catch {
    return EMPTY_NAV;
  }
}

export async function pollPinWebview(
  pinId: string,
  startUrl: string,
): Promise<PinWebviewPollResult> {
  return invokePin("pin_webview_poll", { pinId, startUrl }, { changed: false });
}

export async function closePinWebview(pinId: string): Promise<void> {
  if (!isNativePinRuntime()) return;
  await invoke("pin_webview_close", { pinId });
}

export function subscribePinWebviewNav(
  onNav: (state: PinWebviewNavState & { pinId: string }) => void,
): Promise<() => void> {
  if (!isNativePinRuntime()) {
    return Promise.resolve(() => {});
  }
  return listen<PinWebviewNavState & { pinId: string }>(
    "pin-webview-nav",
    (event) => {
      onNav(event.payload);
    },
  ).catch(() => () => {});
}

export function subscribePinWebviewLoad(
  onLoad: (state: PinWebviewLoadState) => void,
): Promise<() => void> {
  if (!isNativePinRuntime()) {
    return Promise.resolve(() => {});
  }
  return listen<PinWebviewLoadState>("pin-webview-load", (event) => {
    onLoad(event.payload);
  }).catch(() => () => {});
}
