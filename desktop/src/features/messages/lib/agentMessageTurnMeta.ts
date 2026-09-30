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
 * Fallback: pick the turn whose items are closest in time to `replyCreatedAt`
 * (Unix seconds). Used when triggeringEventIds is missing.
 */
export function findNearestTurnIdByTime(
  items: readonly TurnJoinTranscriptItem[],
  replyCreatedAt: number,
): string | null {
  let bestTurnId: string | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const item of items) {
    if (!item.turnId || !item.timestamp) continue;
    const ts = Date.parse(item.timestamp);
    if (!Number.isFinite(ts)) continue;
    const delta = Math.abs(ts / 1000 - replyCreatedAt);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestTurnId = item.turnId;
    }
  }
  // Reject joins more than 10 minutes away — likely a different turn.
  if (bestDelta > 600) return null;
  return bestTurnId;
}

export function filterTranscriptItemsForTurn<T extends TurnJoinTranscriptItem>(
  items: readonly T[],
  turnId: string | null,
): T[] {
  if (!turnId) return [];
  return items.filter((item) => item.turnId === turnId);
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
