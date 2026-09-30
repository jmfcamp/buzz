/** Minimal observer frame shape used for prompt→turn joins. */
export type TurnJoinObserverEvent = {
  kind: string;
  turnId: string | null;
  payload: unknown;
  timestamp?: string;
};

/** Minimal transcript item shape for time-proximity joins / summaries. */
export type TurnJoinTranscriptItem = {
  id: string;
  type: string;
  turnId?: string | null;
  timestamp?: string;
  text?: string;
  title?: string;
};

/** Format a duration in seconds as "12s" or "1:05". */
export function formatTurnDuration(totalSeconds: number | null): string | null {
  if (
    totalSeconds === null ||
    !Number.isFinite(totalSeconds) ||
    totalSeconds < 0
  ) {
    return null;
  }
  const secs = Math.round(totalSeconds);
  if (secs < 60) return `${secs}s`;
  const minutes = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${minutes}:${rem.toString().padStart(2, "0")}`;
}

/** Compact token count for the under-message pill. */
export function formatTurnTokens(
  value: string | number | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  try {
    const n =
      typeof value === "number" ? BigInt(Math.round(value)) : BigInt(value);
    if (n < 0n) return null;
    if (n >= 1_000_000n) return `${(Number(n) / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000n) return `${(Number(n) / 1_000).toFixed(1)}k`;
    return n.toString();
  } catch {
    return null;
  }
}

function extractTriggeringEventIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const ids = (payload as { triggeringEventIds?: unknown }).triggeringEventIds;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string")
    : [];
}

export function isThinkingContentItem(item: TurnJoinTranscriptItem): boolean {
  return item.type === "thought" || item.type === "tool";
}

/**
 * Find the turnId whose turn_started payload lists `promptEventId` in
 * `triggeringEventIds`. Exact join when the harness stamped the prompt.
 */
export function findTurnIdForPromptEvent(
  events: readonly TurnJoinObserverEvent[],
  promptEventId: string | null | undefined,
): string | null {
  if (!promptEventId) return null;
  const needle = promptEventId.toLowerCase();
  for (const event of events) {
    if (event.kind !== "turn_started" || !event.turnId) continue;
    const ids = extractTriggeringEventIds(event.payload);
    if (ids.some((id) => id.toLowerCase() === needle)) {
      return event.turnId;
    }
  }
  return null;
}

/**
 * Prefer a turn that has thought/tool items near `replyCreatedAt`. Falls back
 * to any nearest turn. Rejects joins more than 10 minutes away.
 */
export function findNearestTurnIdByTime(
  items: readonly TurnJoinTranscriptItem[],
  replyCreatedAt: number,
): string | null {
  const scored = new Map<string, { delta: number; hasThinking: boolean }>();
  for (const item of items) {
    if (!item.turnId || !item.timestamp) continue;
    const ts = Date.parse(item.timestamp);
    if (!Number.isFinite(ts)) continue;
    const delta = Math.abs(ts / 1000 - replyCreatedAt);
    const prev = scored.get(item.turnId);
    const hasThinking = isThinkingContentItem(item);
    if (!prev || delta < prev.delta) {
      scored.set(item.turnId, {
        delta,
        hasThinking: hasThinking || Boolean(prev?.hasThinking),
      });
    } else if (hasThinking) {
      scored.set(item.turnId, { ...prev, hasThinking: true });
    }
  }

  let bestId: string | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  let bestHasThinking = false;
  for (const [turnId, score] of scored) {
    if (score.delta > 600) continue;
    // Prefer turns that actually carry thinking content.
    if (score.hasThinking && !bestHasThinking) {
      bestId = turnId;
      bestDelta = score.delta;
      bestHasThinking = true;
      continue;
    }
    if (score.hasThinking === bestHasThinking && score.delta < bestDelta) {
      bestId = turnId;
      bestDelta = score.delta;
      bestHasThinking = score.hasThinking;
    }
  }
  return bestId;
}

export function filterTranscriptItemsForTurn<T extends TurnJoinTranscriptItem>(
  items: readonly T[],
  turnId: string | null,
): T[] {
  if (!turnId) return [];
  return items.filter((item) => item.turnId === turnId);
}

/**
 * Collect thought/tool rows for a reply turn.
 *
 * 1. Exact turnId filter when known
 * 2. Plus thought/tool rows with null turnId in the prompt→reply window
 *    (some harnesses omit turnId on early chunks)
 * 3. If still empty, time-window thought/tool rows regardless of turnId
 */
export function collectThinkingContentItems<T extends TurnJoinTranscriptItem>(
  items: readonly T[],
  options: {
    turnId: string | null;
    windowStartSec: number | null;
    windowEndSec: number;
  },
): T[] {
  const { turnId, windowStartSec, windowEndSec } = options;
  const start = windowStartSec ?? windowEndSec - 600;
  const end = windowEndSec + 30;

  const inWindow = (item: T): boolean => {
    if (!item.timestamp) return false;
    const ts = Date.parse(item.timestamp);
    if (!Number.isFinite(ts)) return false;
    const sec = ts / 1000;
    return sec >= start && sec <= end;
  };

  const byTurn = turnId
    ? items.filter(
        (item) => item.turnId === turnId && isThinkingContentItem(item),
      )
    : [];

  const orphanInWindow = items.filter(
    (item) =>
      isThinkingContentItem(item) &&
      (!item.turnId || item.turnId === turnId) &&
      inWindow(item) &&
      !byTurn.some((existing) => existing.id === item.id),
  );

  const combined = [...byTurn, ...orphanInWindow];
  if (combined.length > 0) return combined;

  // Last resort: any thought/tool in the prompt→reply window.
  return items.filter((item) => isThinkingContentItem(item) && inWindow(item));
}

export function summarizeThinkingItems(
  items: readonly TurnJoinTranscriptItem[],
): {
  thoughtCount: number;
  toolCount: number;
  thoughtPreview: string | null;
} {
  let thoughtCount = 0;
  let toolCount = 0;
  let thoughtPreview: string | null = null;
  for (const item of items) {
    if (item.type === "thought") {
      thoughtCount += 1;
      if (!thoughtPreview && item.text?.trim()) {
        thoughtPreview = item.text.trim();
      }
    } else if (item.type === "tool") {
      toolCount += 1;
    }
  }
  return { thoughtCount, toolCount, thoughtPreview };
}
