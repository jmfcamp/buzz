/**
 * When a markdown/link click opens a matched pinned site, queue the clicked
 * URL so PinnedSiteScreen navigates that pin's webview to it (reuse session).
 *
 * Left-click and "Open in Pinned Website" share this path: queue then
 * goPinnedSite. Subscribers cover the already-on-pin case where navigation is
 * a no-op but the webview still needs to load the full href.
 *
 * consume peeks only — Strict Mode remounts must not delete the pending URL.
 * clear after the surface successfully applies startUrl to the webview.
 */
const pendingByPinId = new Map<string, string>();

type PendingPinOpenListener = (pinId: string, url: string) => void;
const listeners = new Set<PendingPinOpenListener>();

export function queuePinnedSiteOpenUrl(pinId: string, url: string): void {
  const trimmed = url.trim();
  if (!pinId || !trimmed) return;
  pendingByPinId.set(pinId, trimmed);
  for (const listener of listeners) {
    listener(pinId, trimmed);
  }
}

/** Peek pending URL for pinId; do not delete (Strict Mode remount-safe). */
export function consumePinnedSiteOpenUrl(
  pinId: string,
  fallback: string,
): string {
  const next = pendingByPinId.get(pinId);
  return next ?? fallback;
}

/**
 * Drop a pending URL after the pin surface applied it. If `appliedUrl` is set,
 * delete only when the map still holds that exact URL (a newer queue wins).
 * Omit `appliedUrl` to clear unconditionally.
 */
export function clearPinnedSiteOpenUrl(
  pinId: string,
  appliedUrl?: string,
): void {
  if (!pinId) return;
  if (appliedUrl === undefined) {
    pendingByPinId.delete(pinId);
    return;
  }
  if (pendingByPinId.get(pinId) === appliedUrl) {
    pendingByPinId.delete(pinId);
  }
}

/** Notify when a deep-link URL is queued for an already-mounted pin screen. */
export function subscribePinnedSiteOpenUrl(
  listener: PendingPinOpenListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetPendingPinnedSiteOpenForTests(): void {
  pendingByPinId.clear();
  listeners.clear();
}
