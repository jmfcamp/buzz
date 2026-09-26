/**
 * Per-session playground viewport snapshot for Browsers list captions and
 * restoring Desktop/Responsive/Mobile when chrome remounts.
 * In-memory only (not persisted).
 */

export type PlaygroundChromeMode = "desktop" | "responsive" | "mobile";

export type PlaygroundViewportSnapshot = {
  mode: PlaygroundChromeMode;
  /** CSS viewport width; 0 = unknown / not measured yet. */
  width: number;
  /** CSS viewport height; 0 = unknown / not measured yet. */
  height: number;
  /** Mobile museum scale percent (50–200). Omitted for desktop/responsive. */
  scalePercent?: number;
};

const DEFAULT_SNAPSHOT: PlaygroundViewportSnapshot = {
  mode: "desktop",
  width: 0,
  height: 0,
};

const bySid = new Map<string, PlaygroundViewportSnapshot>();
const listeners = new Set<() => void>();
let revision = 0;

function emit() {
  revision += 1;
  for (const listener of listeners) listener();
}

function sameSnapshot(
  a: PlaygroundViewportSnapshot,
  b: PlaygroundViewportSnapshot,
): boolean {
  return (
    a.mode === b.mode &&
    a.width === b.width &&
    a.height === b.height &&
    (a.scalePercent ?? null) === (b.scalePercent ?? null)
  );
}

export function subscribePlaygroundViewport(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPlaygroundViewportRevision(): number {
  return revision;
}

export function getPlaygroundViewport(
  sid: string,
): PlaygroundViewportSnapshot {
  return bySid.get(sid) ?? DEFAULT_SNAPSHOT;
}

/** Patch/merge viewport fields for a session; no-op when unchanged. */
export function setPlaygroundViewport(
  sid: string,
  patch: Partial<PlaygroundViewportSnapshot> &
    Pick<PlaygroundViewportSnapshot, "mode">,
): PlaygroundViewportSnapshot {
  const prev = bySid.get(sid) ?? DEFAULT_SNAPSHOT;
  const next: PlaygroundViewportSnapshot = {
    mode: patch.mode,
    width: patch.width ?? prev.width,
    height: patch.height ?? prev.height,
  };
  if (patch.mode === "mobile") {
    const scale =
      patch.scalePercent ?? prev.scalePercent ?? 100;
    next.scalePercent = scale;
  }
  if (sameSnapshot(prev, next) && bySid.has(sid)) {
    return prev;
  }
  bySid.set(sid, next);
  emit();
  return next;
}

export function clearPlaygroundViewport(sid: string): void {
  if (!bySid.delete(sid)) return;
  emit();
}

export function resetPlaygroundViewports(): void {
  if (bySid.size === 0) return;
  bySid.clear();
  emit();
}

const MODE_LABEL: Record<PlaygroundChromeMode, string> = {
  desktop: "Desktop",
  responsive: "Responsive",
  mobile: "Mobile",
};

/** Compact list chip: `Desktop · 1280×800` / `Mobile · 393×852 · 150%`. */
export function playgroundViewportCaption(
  snapshot: PlaygroundViewportSnapshot | null | undefined,
): string {
  const s = snapshot ?? DEFAULT_SNAPSHOT;
  const label = MODE_LABEL[s.mode] ?? "Desktop";
  const hasDims = s.width > 0 && s.height > 0;
  const dims = hasDims ? `${s.width}×${s.height}` : null;
  const scale =
    s.mode === "mobile" &&
    s.scalePercent != null &&
    s.scalePercent !== 100
      ? `${s.scalePercent}%`
      : null;
  return [label, dims, scale].filter(Boolean).join(" · ");
}
