import { canonicalRelayUrl } from "@/features/agents/managedAgentRuntimeStatus";

import { bestieThreadId } from "./bestieThreadProtocol";
import type {
  BestieThreadScope,
  BestieThreadState,
  BestieThreadUpsertInput,
  BestieTrackedThread,
} from "./bestieThreadTypes";

export const BESTIE_THREAD_STORAGE_PREFIX = "buzz-bestie-threads.v1";
export const BESTIE_THREAD_MAX = 80;

export function bestieThreadStorageKey(scope: BestieThreadScope): string {
  const relay =
    canonicalRelayUrl(scope.relayUrl) ?? scope.relayUrl.trim().toLowerCase();
  return [
    BESTIE_THREAD_STORAGE_PREFIX,
    relay,
    scope.ownerPubkey.toLowerCase(),
    scope.agentPubkey.toLowerCase(),
  ].join(":");
}

export const EMPTY_BESTIE_THREAD_STATE: BestieThreadState = Object.freeze({
  pendingSummarize: null,
  threads: Object.freeze([]) as unknown as BestieTrackedThread[],
  version: 1,
});

export function emptyBestieThreadState(): BestieThreadState {
  return EMPTY_BESTIE_THREAD_STATE;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseThread(value: unknown): BestieTrackedThread | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.channelId !== "string" ||
    typeof record.rootEventId !== "string" ||
    typeof record.preview !== "string" ||
    !isFiniteNonNegative(record.addedAt) ||
    !isFiniteNonNegative(record.lastActiveAt)
  ) {
    return null;
  }
  return {
    addedAt: Math.floor(record.addedAt),
    authorName:
      typeof record.authorName === "string" && record.authorName.trim()
        ? record.authorName.trim()
        : null,
    channelId: record.channelId,
    channelName:
      typeof record.channelName === "string" && record.channelName.trim()
        ? record.channelName.trim()
        : null,
    id: record.id,
    lastActiveAt: Math.floor(record.lastActiveAt),
    lastSummary:
      typeof record.lastSummary === "string" && record.lastSummary.trim()
        ? record.lastSummary
        : null,
    lastSummaryAt: isFiniteNonNegative(record.lastSummaryAt)
      ? Math.floor(record.lastSummaryAt)
      : null,
    preview: record.preview.trim(),
    rootEventId: record.rootEventId,
  };
}

export function parseBestieThreadState(
  value: unknown,
): BestieThreadState | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.threads)) return null;
  const threads: BestieTrackedThread[] = [];
  for (const entry of record.threads) {
    const parsed = parseThread(entry);
    if (parsed) threads.push(parsed);
  }
  let pendingSummarize: BestieThreadState["pendingSummarize"] = null;
  if (
    typeof record.pendingSummarize === "object" &&
    record.pendingSummarize !== null
  ) {
    const pending = record.pendingSummarize as Record<string, unknown>;
    if (
      typeof pending.threadId === "string" &&
      isFiniteNonNegative(pending.startedAt)
    ) {
      pendingSummarize = {
        startedAt: Math.floor(pending.startedAt),
        threadId: pending.threadId,
      };
    }
  }
  return { pendingSummarize, threads, version: 1 };
}

export function readBestieThreadState(
  scope: BestieThreadScope,
): BestieThreadState {
  try {
    const raw = window.localStorage.getItem(bestieThreadStorageKey(scope));
    if (!raw) return emptyBestieThreadState();
    return parseBestieThreadState(JSON.parse(raw)) ?? emptyBestieThreadState();
  } catch {
    return emptyBestieThreadState();
  }
}

export function writeBestieThreadState(
  scope: BestieThreadScope,
  state: BestieThreadState,
): void {
  try {
    window.localStorage.setItem(
      bestieThreadStorageKey(scope),
      JSON.stringify(state),
    );
  } catch {
    // ignore quota
  }
}

export function upsertBestieTrackedThread(
  state: BestieThreadState,
  input: BestieThreadUpsertInput,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieThreadState {
  const channelId = input.channelId.trim();
  const rootEventId = input.rootEventId.trim();
  if (!channelId || !rootEventId) return state;
  const id = bestieThreadId(channelId, rootEventId);
  const preview = input.preview.trim().slice(0, 280);
  const existing = state.threads.find((thread) => thread.id === id);
  const nextThread: BestieTrackedThread = existing
    ? {
        ...existing,
        authorName: input.authorName?.trim() || existing.authorName,
        channelName: input.channelName?.trim() || existing.channelName,
        lastActiveAt: nowSeconds,
        preview: preview || existing.preview,
      }
    : {
        addedAt: nowSeconds,
        authorName: input.authorName?.trim() || null,
        channelId,
        channelName: input.channelName?.trim() || null,
        id,
        lastActiveAt: nowSeconds,
        lastSummary: null,
        lastSummaryAt: null,
        preview,
        rootEventId,
      };
  const threads = [
    nextThread,
    ...state.threads.filter((thread) => thread.id !== id),
  ].slice(0, BESTIE_THREAD_MAX);
  return { ...state, threads };
}

export function removeBestieTrackedThread(
  state: BestieThreadState,
  id: string,
): BestieThreadState {
  const threads = state.threads.filter((thread) => thread.id !== id);
  if (threads.length === state.threads.length) return state;
  const pendingSummarize =
    state.pendingSummarize?.threadId === id ? null : state.pendingSummarize;
  return { ...state, pendingSummarize, threads };
}

export function beginBestieThreadSummarize(
  state: BestieThreadState,
  threadId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieThreadState | null {
  if (state.pendingSummarize) return null;
  if (!state.threads.some((thread) => thread.id === threadId)) return null;
  return {
    ...state,
    pendingSummarize: { startedAt: nowSeconds, threadId },
  };
}

export function clearBestieThreadSummarize(
  state: BestieThreadState,
): BestieThreadState {
  if (!state.pendingSummarize) return state;
  return { ...state, pendingSummarize: null };
}

export function completeBestieThreadSummarize(
  state: BestieThreadState,
  summary: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieThreadState {
  const pending = state.pendingSummarize;
  if (!pending) return state;
  const trimmed = summary.trim();
  const threads = state.threads.map((thread) =>
    thread.id === pending.threadId
      ? {
          ...thread,
          lastActiveAt: nowSeconds,
          lastSummary: trimmed || thread.lastSummary,
          lastSummaryAt: nowSeconds,
        }
      : thread,
  );
  return { ...state, pendingSummarize: null, threads };
}

export function sortedBestieThreads(
  state: BestieThreadState,
): BestieTrackedThread[] {
  return state.threads
    .slice()
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);
}
