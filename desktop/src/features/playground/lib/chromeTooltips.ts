/** Hover labels for icon-only playground overlay chrome. */
export const PLAYGROUND_CHROME_TOOLTIPS = {
  dispose: "Dispose",
  back: "Back",
  forward: "Forward",
  refresh: "Refresh",
  copy: "Copy URL",
  inspect: "Inspect",
  screenshot: "Screenshot",
  fullscreen: "Fullscreen",
  exitFullscreen: "Exit fullscreen",
  dismiss: "Dismiss",
  dock: "Dock left",
  expand: "Expand overlay",
} as const;

export type PlaygroundChromeTooltipId = keyof typeof PLAYGROUND_CHROME_TOOLTIPS;

/** Label for one playground chrome control. Visible text rows skip this. */
export function playgroundChromeTooltip(
  id: PlaygroundChromeTooltipId,
): string {
  return PLAYGROUND_CHROME_TOOLTIPS[id];
}

export function playgroundFullscreenTooltip(fullscreen: boolean): string {
  return playgroundChromeTooltip(fullscreen ? "exitFullscreen" : "fullscreen");
}

export function playgroundDockTooltip(docked: boolean): string {
  return playgroundChromeTooltip(docked ? "expand" : "dock");
}

/** Icon-only chrome controls that must expose a delayed tooltip. */
export const PLAYGROUND_ICON_ONLY_CHROME_TOOLTIP_IDS = [
  "dispose",
  "back",
  "forward",
  "refresh",
  "copy",
  "inspect",
  "screenshot",
  "fullscreen",
  "exitFullscreen",
  "dismiss",
  "dock",
  "expand",
] as const satisfies readonly PlaygroundChromeTooltipId[];
