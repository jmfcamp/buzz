import { topChromeBackdrop } from "@/shared/layout/chromeLayout";

/** Spacer under the overlay titlebar so traffic lights stay clickable. */
export const PLAYGROUND_FULLSCREEN_TITLEBAR_GAP_TEST_ID =
  "playground-fullscreen-titlebar-gap";

/**
 * Same 40px strip as `AppTopChrome`. Fixed px via the chrome CSS variable so
 * Cmd +/- zoom cannot pull Dispose into the macOS traffic-light hit region.
 */
export const playgroundFullscreenTitlebarGapClass = topChromeBackdrop.height;

export function playgroundStageLayoutKey(
  fullscreen: boolean,
  epoch: number,
): string {
  return `${fullscreen ? "fullscreen" : "window"}:${epoch}`;
}
