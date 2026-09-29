/** Main-app huddle chrome: drawer bar XOR native companion OS window. */
export type HuddlePresentation = "none" | "drawer" | "window";

/**
 * Main webview only: mount the drawer / HuddleBar when presentation is
 * explicitly `"drawer"`. `"none"` stays unmounted (no always-on bar before
 * dock). `"window"` stays unmounted so the companion owns chrome (XOR).
 * The companion room webview always mounts its own bar separately (`isRoom`).
 */
export function shouldMountMainHuddleDrawerBar(
  presentation: HuddlePresentation,
): boolean {
  return presentation === "drawer";
}

type ReconcileOptions = {
  /** True while `open_huddle_window` has not settled. */
  openInFlight?: boolean;
  /** True when an ephemeral huddle session is still active. */
  huddleActive?: boolean;
};

/**
 * Reconcile React presentation with native `huddle_companion_window_exists`.
 * Native existence wins: if the companion webview is in the window map, main
 * must be `"window"` so the drawer bar unmounts (XOR). Returns null when the
 * current presentation already matches.
 */
export function reconcilePresentationWithNativeExists(
  presentation: HuddlePresentation,
  companionExists: boolean,
  options: ReconcileOptions = {},
): HuddlePresentation | null {
  if (companionExists) {
    return presentation === "window" ? null : "window";
  }
  if (options.openInFlight) {
    return null;
  }
  if (presentation !== "window") {
    return null;
  }
  return options.huddleActive ? "drawer" : "none";
}

/**
 * Main may mount the drawer bar only after companion open is no longer the
 * active path. During start/join (pending) or while open_huddle_window is
 * in flight, stay on `"none"` so the main dock never flashes before the
 * companion loads. Promote when the user docked (dismissed) or when start
 * settled with no companion and no open in flight.
 */
export function shouldPromoteNoneToDrawer(options: {
  presentation: HuddlePresentation;
  companionExists: boolean;
  openInFlight: boolean;
  startPending: boolean;
}): boolean {
  if (options.presentation !== "none") return false;
  if (options.companionExists) return false;
  if (options.openInFlight) return false;
  if (options.startPending) return false;
  // Settled fallback / dismissed dock — caller also requires active phase.
  return true;
}
