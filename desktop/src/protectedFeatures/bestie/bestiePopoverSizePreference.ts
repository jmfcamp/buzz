import * as React from "react";

/**
 * Persisted Assistant popover size (width + max height). Drag handles in the
 * popover chrome write here; defaults are intentionally taller/wider than the
 * old fixed w-80 / 32rem so chat has room above Lists.
 */
export const BESTIE_POPOVER_SIZE_STORAGE_KEY = "buzz-bestie-popover-size.v1";

/** Default width (px) — was Tailwind w-80 = 320. */
export const BESTIE_POPOVER_DEFAULT_WIDTH_PX = 448;
/** Default max height (px) — was 32rem = 512. */
export const BESTIE_POPOVER_DEFAULT_MAX_HEIGHT_PX = 720;

export const BESTIE_POPOVER_MIN_WIDTH_PX = 320;
export const BESTIE_POPOVER_MAX_WIDTH_PX = 720;
export const BESTIE_POPOVER_MIN_MAX_HEIGHT_PX = 420;
export const BESTIE_POPOVER_MAX_MAX_HEIGHT_PX = 960;

export type BestiePopoverSize = {
  maxHeightPx: number;
  widthPx: number;
};

type StoredSize = Partial<BestiePopoverSize>;

const listeners = new Set<() => void>();

let size: BestiePopoverSize = readStoredSize();

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeSize(input: StoredSize | null | undefined): BestiePopoverSize {
  return {
    maxHeightPx: clamp(
      input?.maxHeightPx ?? BESTIE_POPOVER_DEFAULT_MAX_HEIGHT_PX,
      BESTIE_POPOVER_MIN_MAX_HEIGHT_PX,
      BESTIE_POPOVER_MAX_MAX_HEIGHT_PX,
    ),
    widthPx: clamp(
      input?.widthPx ?? BESTIE_POPOVER_DEFAULT_WIDTH_PX,
      BESTIE_POPOVER_MIN_WIDTH_PX,
      BESTIE_POPOVER_MAX_WIDTH_PX,
    ),
  };
}

function readStoredSize(): BestiePopoverSize {
  if (typeof window === "undefined") {
    return normalizeSize(null);
  }
  try {
    const raw = window.localStorage.getItem(BESTIE_POPOVER_SIZE_STORAGE_KEY);
    if (!raw) return normalizeSize(null);
    return normalizeSize(JSON.parse(raw) as StoredSize);
  } catch {
    return normalizeSize(null);
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): BestiePopoverSize {
  return size;
}

function getServerSnapshot(): BestiePopoverSize {
  return normalizeSize(null);
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Replace width and/or max height; persists to localStorage. */
export function setBestiePopoverSize(
  patch: Partial<BestiePopoverSize>,
): BestiePopoverSize {
  size = normalizeSize({ ...size, ...patch });
  try {
    window.localStorage.setItem(
      BESTIE_POPOVER_SIZE_STORAGE_KEY,
      JSON.stringify(size),
    );
  } catch {
    // Persistence is best-effort; in-memory size still applies.
  }
  emit();
  return size;
}

export function useBestiePopoverSize(): BestiePopoverSize {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** @internal */
export function __resetBestiePopoverSizeForTests(): void {
  size = normalizeSize(null);
  try {
    window.localStorage.removeItem(BESTIE_POPOVER_SIZE_STORAGE_KEY);
  } catch {
    // ignore
  }
  emit();
}
