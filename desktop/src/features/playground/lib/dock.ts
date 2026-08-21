export const PLAYGROUND_DOCK_WIDTH_SESSION_KEY =
  "buzz.desktop.playground-dock-width";

/** Floor so chrome + preview stay usable. */
export const PLAYGROUND_DOCK_MIN_WIDTH_PX = 320;

/** Leave a clickable chat/thread remainder to the right of the dock. */
export const PLAYGROUND_DOCK_MIN_REMAINDER_PX = 280;

/** Used when the main inset has no measurable width (tests, first paint). */
export const PLAYGROUND_DOCK_DEFAULT_WIDTH_PX = 480;

export const PLAYGROUND_DOCK_RATIO = 0.5;

/**
 * Channel split-thread pane. Must match `message-thread-panel` on
 * `RightAuxiliaryPane` in ChannelPane — do not invent a width.
 */
export const PLAYGROUND_CHANNEL_THREAD_PANEL_TEST_ID = "message-thread-panel";

export type PlaygroundDockThreadEdge = {
  mainLeft: number;
  mainWidth: number;
  threadLeft: number;
  threadWidth: number;
};

export type PlaygroundDockRect = {
  getBoundingClientRect: () => { left: number; width: number };
};

/**
 * Overlay placement:
 * - `window` — full-main cover (default Open)
 * - `dock` — left split; chat/thread stay real on the right
 * - `fullscreen` — in-app cover with a 40px titlebar gap
 *
 * Dismiss parks; Dispose destroys. Dock is a third mode: overlay stays
 * open. Fullscreen from dock keeps `docked` so Escape returns to dock.
 */
export type PlaygroundOverlayPlacement = "window" | "dock" | "fullscreen";

export type PlaygroundOverlaySearchState = {
  docked: boolean;
  fullscreen: boolean;
  placement: PlaygroundOverlayPlacement;
};

/** Fullscreen wins; dock is a split of the windowed overlay, not a park. */
export function playgroundOverlayPlacement(
  fullscreen: boolean,
  docked: boolean,
): PlaygroundOverlayPlacement {
  if (fullscreen) return "fullscreen";
  if (docked) return "dock";
  return "window";
}

/** Only in-app fullscreen portals to `document.body`. Dock stays in the inset. */
export function playgroundOverlayShouldPortal(fullscreen: boolean): boolean {
  return fullscreen;
}

export function defaultPlaygroundDockWidth(mainWidth: number): number {
  if (!Number.isFinite(mainWidth) || mainWidth <= 0) {
    return PLAYGROUND_DOCK_DEFAULT_WIDTH_PX;
  }
  return clampPlaygroundDockWidth(
    Math.round(mainWidth * PLAYGROUND_DOCK_RATIO),
    mainWidth,
  );
}

export function clampPlaygroundDockWidth(
  width: number,
  mainWidth: number,
): number {
  if (!Number.isFinite(width)) {
    return defaultPlaygroundDockWidth(mainWidth);
  }
  const usable =
    Number.isFinite(mainWidth) && mainWidth > 0 ? mainWidth : width;
  const max = Math.max(
    PLAYGROUND_DOCK_MIN_WIDTH_PX,
    usable - PLAYGROUND_DOCK_MIN_REMAINDER_PX,
  );
  return Math.max(
    PLAYGROUND_DOCK_MIN_WIDTH_PX,
    Math.min(max, Math.round(width)),
  );
}

export function parseStoredPlaygroundDockWidth(
  raw: string | null | undefined,
): number | null {
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readStoredPlaygroundDockWidth(): number | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredPlaygroundDockWidth(
      window.sessionStorage.getItem(PLAYGROUND_DOCK_WIDTH_SESSION_KEY),
    );
  } catch {
    return null;
  }
}

export function persistPlaygroundDockWidth(width: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PLAYGROUND_DOCK_WIDTH_SESSION_KEY,
      String(width),
    );
  } catch {
    // Session-only in-memory width still applies for this overlay.
  }
}

export function resolvePlaygroundDockWidth(
  mainWidth: number,
  stored: number | null = readStoredPlaygroundDockWidth(),
): number {
  if (stored == null) {
    return defaultPlaygroundDockWidth(mainWidth);
  }
  return clampPlaygroundDockWidth(stored, mainWidth);
}

/**
 * Dock width whose right edge meets the thread pane's left edge.
 * Flush split: `mainWidth - threadWidth` when the pane is right-aligned
 * in the inset (any gap/divider is included via the measured left).
 */
export function playgroundDockWidthFlushToThread(
  mainWidth: number,
  threadWidth: number,
): number {
  return clampPlaygroundDockWidth(mainWidth - threadWidth, mainWidth);
}

/** Same snap from the thread pane's left edge relative to the main inset. */
export function playgroundDockWidthFromThreadLeft(
  mainWidth: number,
  mainLeft: number,
  threadLeft: number,
): number {
  return clampPlaygroundDockWidth(threadLeft - mainLeft, mainWidth);
}

export function readPlaygroundDockThreadEdge(
  main: PlaygroundDockRect,
  thread: PlaygroundDockRect | null | undefined,
): PlaygroundDockThreadEdge | null {
  if (!thread) return null;
  const mainBox = main.getBoundingClientRect();
  const threadBox = thread.getBoundingClientRect();
  if (!(mainBox.width > 0) || !(threadBox.width > 0)) {
    return null;
  }
  return {
    mainLeft: mainBox.left,
    mainWidth: mainBox.width,
    threadLeft: threadBox.left,
    threadWidth: threadBox.width,
  };
}

/**
 * First-dock / dock-action width. A prior user drag wins; otherwise snap
 * to an open split-thread pane, or fall back to ~50% of the main inset.
 */
export function resolvePlaygroundDockWidthOnDock(input: {
  mainWidth: number;
  threadEdge?: PlaygroundDockThreadEdge | null;
  userResized?: boolean;
  stored?: number | null;
}): number {
  if (input.userResized) {
    return resolvePlaygroundDockWidth(
      input.mainWidth,
      input.stored === undefined
        ? readStoredPlaygroundDockWidth()
        : input.stored,
    );
  }
  const edge = input.threadEdge;
  if (edge && edge.threadWidth > 0) {
    return playgroundDockWidthFromThreadLeft(
      input.mainWidth,
      edge.mainLeft,
      edge.threadLeft,
    );
  }
  return defaultPlaygroundDockWidth(input.mainWidth);
}

export function playgroundOverlaySearchState(
  overlay: Element,
): PlaygroundOverlaySearchState {
  const fullscreen = overlay.getAttribute("data-fullscreen") === "true";
  const docked = overlay.getAttribute("data-docked") === "true";
  return {
    docked,
    fullscreen,
    placement: playgroundOverlayPlacement(fullscreen, docked),
  };
}

/**
 * Docked overlay must leave some of the main inset uncovered so chat/thread
 * stay real hit targets, not a ghost under a full-width portal.
 */
export function playgroundDockLeavesMainClickable(
  overlay: { getBoundingClientRect: () => { left: number; width: number } },
  main: { getBoundingClientRect: () => { left: number; width: number } },
): boolean {
  const overlayBox = overlay.getBoundingClientRect();
  const mainBox = main.getBoundingClientRect();
  const overlayRight = overlayBox.left + overlayBox.width;
  const mainRight = mainBox.left + mainBox.width;
  return overlayBox.left >= mainBox.left && overlayRight < mainRight;
}
