import { topChromeBackdrop } from "@/shared/layout/chromeLayout";

import {
  playgroundOverlayPlacement,
  type PlaygroundOverlayPlacement,
} from "./dock";

/** Spacer under the overlay titlebar so traffic lights stay clickable. */
export const PLAYGROUND_FULLSCREEN_TITLEBAR_GAP_TEST_ID =
  "playground-fullscreen-titlebar-gap";

/**
 * Solid overlay fill. `--background` is HSL channels with no alpha, so
 * `bg-background` is 100% opaque. Never use `/95`, `/80`, `/70`, `/55`, or
 * backdrop-blur here — AppTopChrome's frosted `headerBase` must not be
 * borrowed, and the previous surface (channel, Inbox) must not show through.
 */
export const PLAYGROUND_OVERLAY_SURFACE_CLASS = "bg-background";

/** In-app fullscreen covers the viewport, including the AppTopChrome strip. */
export const PLAYGROUND_FULLSCREEN_OVERLAY_CLASS =
  "fixed inset-0 z-50 pointer-events-auto";

/** Windowed overlay stays inside the channel inset, not the titlebar. */
export const PLAYGROUND_WINDOWED_OVERLAY_CLASS = "absolute inset-0 z-30";

/**
 * Left-anchored split of the main inset. Never `inset-0` — that would stretch
 * over chat even when a width is set. Stays in SidebarInset (not portaled).
 */
export const PLAYGROUND_DOCKED_OVERLAY_CLASS =
  "absolute inset-y-0 left-0 z-30 overflow-visible border-r border-border";

/** Right-edge drag, mirrored from the thread / AuxiliaryPanel handle. */
export const PLAYGROUND_DOCK_RESIZE_HANDLE_CLASS =
  "absolute inset-y-0 right-0 z-40 w-3 translate-x-1/2 cursor-col-resize touch-none";

export const PLAYGROUND_DOCK_RESIZE_HANDLE_TEST_ID = "playground-dock-resize";

/**
 * Same 40px strip as `AppTopChrome`. Fixed px via the chrome CSS variable so
 * Cmd +/- zoom cannot pull Dispose into the macOS traffic-light hit region.
 * Painted opaque so fullscreen does not leak titlebar vibrancy. This gap is
 * the only `data-tauri-drag-region` — never put drag on the chrome row.
 */
export const playgroundFullscreenTitlebarGapClass = `${topChromeBackdrop.height} ${PLAYGROUND_OVERLAY_SURFACE_CLASS}`;

export const PLAYGROUND_CHROME_CLASS = `relative z-20 flex shrink-0 flex-col gap-1 border-b border-border pointer-events-auto px-2 py-1 ${PLAYGROUND_OVERLAY_SURFACE_CLASS}`;

/**
 * Force alpha 1 so macOS titlebar vibrancy cannot blend through `--background`
 * when the WKWebView canvas is transparent (glass).
 */
export const PLAYGROUND_OPAQUE_FILL_STYLE = {
  backgroundColor: "hsl(var(--background) / 1)",
} as const;

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
      (token) => token.includes("backdrop-blur") || /\/\d+$/.test(token),
    )
  );
}

/** Dispose / nav / URL / Inspect must not sit on a Tauri drag region. */
export function playgroundFullscreenDragRegionIsGapOnly(
  gap: Element,
  chrome: Element,
): boolean {
  return (
    gap.hasAttribute("data-tauri-drag-region") &&
    !chrome.hasAttribute("data-tauri-drag-region") &&
    !gap.contains(chrome) &&
    chrome.querySelector("[data-tauri-drag-region]") == null
  );
}

/** Fullscreen must portal to `document.body` so AppTopChrome cannot steal hits. */
export function playgroundFullscreenOverlayIsPortaled(
  overlay: Element,
): boolean {
  return overlay.parentElement === overlay.ownerDocument?.body;
}

export function playgroundResizeHandleSitsOutsideHost(
  host: { contains: (node: Node) => boolean },
  handle: Node,
): boolean {
  return !host.contains(handle);
}

export function playgroundOverlayPlacementClass(
  placement: PlaygroundOverlayPlacement,
): string {
  switch (placement) {
    case "fullscreen":
      return PLAYGROUND_FULLSCREEN_OVERLAY_CLASS;
    case "dock":
      return PLAYGROUND_DOCKED_OVERLAY_CLASS;
    default:
      return PLAYGROUND_WINDOWED_OVERLAY_CLASS;
  }
}

export function playgroundStageLayoutKey(
  fullscreen: boolean,
  epoch: number,
  docked = false,
): string {
  return `${playgroundOverlayPlacement(fullscreen, docked)}:${epoch}`;
}
