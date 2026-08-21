import { topChromeBackdrop } from "@/shared/layout/chromeLayout";

/** Spacer under the overlay titlebar so traffic lights stay clickable. */
export const PLAYGROUND_FULLSCREEN_TITLEBAR_GAP_TEST_ID =
  "playground-fullscreen-titlebar-gap";

/**
 * Solid overlay fill. `--background` is HSL channels with no alpha, so
 * `bg-background` is 100% opaque. Never use `/95` or backdrop-blur here —
 * the previous surface (channel, Inbox) must not show through.
 */
export const PLAYGROUND_OVERLAY_SURFACE_CLASS = "bg-background";

/**
 * Same 40px strip as `AppTopChrome`. Fixed px via the chrome CSS variable so
 * Cmd +/- zoom cannot pull Dispose into the macOS traffic-light hit region.
 * Painted opaque so fullscreen does not leak the titlebar / previous surface.
 */
export const playgroundFullscreenTitlebarGapClass = `${topChromeBackdrop.height} ${PLAYGROUND_OVERLAY_SURFACE_CLASS}`;

/** 8px gutter so edge handles sit outside the native WKWebView host. */
export const PLAYGROUND_RESIZE_HANDLE_GUTTER_CLASS = "pr-2 pb-2";

export const PLAYGROUND_RESIZE_HANDLE_CLASS = {
  x: "absolute bottom-2 right-0 top-0 z-20 w-2 cursor-ew-resize touch-none rounded-full bg-border",
  y: "absolute bottom-0 left-0 right-2 z-20 h-2 cursor-ns-resize touch-none rounded-full bg-border",
  xy: "absolute bottom-0 right-0 z-20 h-2 w-2 cursor-nwse-resize touch-none rounded-sm bg-border",
} as const;

export function playgroundOverlaySurfaceIsOpaque(className: string): boolean {
  const tokens = className.trim().split(/\s+/);
  return (
    tokens.includes(PLAYGROUND_OVERLAY_SURFACE_CLASS) &&
    !tokens.some(
      (token) => token.includes("backdrop-blur") || /\/\d{2,3}$/.test(token),
    )
  );
}

export function playgroundResizeHandleSitsOutsideHost(
  host: { contains: (node: Node) => boolean },
  handle: Node,
): boolean {
  return !host.contains(handle);
}

export function playgroundStageLayoutKey(
  fullscreen: boolean,
  epoch: number,
): string {
  return `${fullscreen ? "fullscreen" : "window"}:${epoch}`;
}
