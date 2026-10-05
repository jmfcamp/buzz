/**
 * Poll tracked Assistant threads for newer replies so Resummarize can show.
 * Uses the existing getThreadReplies desktop API (messages from anyone).
 */

import type { RelayEvent } from "@/shared/api/types";

import {
  getBestieThreadState,
  upsertBestieTrackedThreadForScope,
} from "./bestieThreadStore";
import type {
  BestieThreadScope,
  BestieTrackedThread,
} from "./bestieThreadTypes";

/** How often the Threads UI re-checks for post-summary activity. */
export const BESTIE_THREAD_ACTIVITY_POLL_MS = 15 * 60 * 1000;

const THREAD_PAGE_LIMIT = 200;
const MAX_THREAD_PAGES = 50;

export type ThreadRepliesPageFetcher = (
  rootEventId: string,
  channelId: string,
  options: {
    limit: number;
    cursor: { createdAt: number; eventId: string } | null;
  },
) => Promise<{
  events: readonly RelayEvent[];
  nextCursor: { createdAt: number; eventId: string } | null;
}>;

/**
 * Whether the 15-minute activity check should fetch this row.
 * Skip never-summarized (Summarize already shows) and pending summarize.
 */
export function bestieThreadShouldCheckForNewerMessages(
  thread: Pick<BestieTrackedThread, "id" | "lastSummaryAt">,
  pendingThreadId: string | null,
): boolean {
  if (thread.lastSummaryAt == null) return false;
  if (pendingThreadId != null && pendingThreadId === thread.id) return false;
  return true;
}

/** Max finite `created_at` among reply events, or null if none. */
export function newestThreadReplyCreatedAt(
  events: readonly Pick<RelayEvent, "created_at">[],
): number | null {
  let newest: number | null = null;
  for (const event of events) {
    if (
      typeof event.created_at !== "number" ||
      !Number.isFinite(event.created_at)
    ) {
      continue;
    }
    const at = Math.floor(event.created_at);
    if (newest == null || at > newest) newest = at;
  }
  return newest;
}

async function defaultThreadRepliesFetcher(
  rootEventId: string,
  channelId: string,
  options: {
    limit: number;
    cursor: { createdAt: number; eventId: string } | null;
  },
) {
  const { getThreadReplies } = await import("@/shared/api/tauri");
  return getThreadReplies(rootEventId, channelId, options);
}

/**
 * Page through getThreadReplies (oldest-first) and return the newest created_at.
 * Best-effort: stops at MAX_THREAD_PAGES.
 */
export async function loadNewestThreadReplyCreatedAt(
  channelId: string,
  rootEventId: string,
  fetchReplies: ThreadRepliesPageFetcher = defaultThreadRepliesFetcher,
): Promise<number | null> {
  let newest: number | null = null;
  let cursor: { createdAt: number; eventId: string } | null = null;
  for (let page = 0; page < MAX_THREAD_PAGES; page += 1) {
    const response = await fetchReplies(rootEventId, channelId, {
      limit: THREAD_PAGE_LIMIT,
      cursor,
    });
    const pageNewest = newestThreadReplyCreatedAt(response.events);
    if (pageNewest != null && (newest == null || pageNewest > newest)) {
      newest = pageNewest;
    }
    if (!response.nextCursor) break;
    cursor = response.nextCursor;
  }
  return newest;
}

/**
 * For each already-summarized tracked thread (not pending), load replies and
 * bump lastActiveAt when the newest reply is strictly newer than lastSummaryAt.
 * Failed fetches are swallowed per-thread.
 */
export async function refreshBestieTrackedThreadActivity(
  scope: BestieThreadScope,
  options?: {
    fetchReplies?: ThreadRepliesPageFetcher;
  },
): Promise<void> {
  const state = getBestieThreadState(scope);
  const pendingId = state.pendingSummarize?.threadId ?? null;
  const fetchReplies = options?.fetchReplies ?? defaultThreadRepliesFetcher;

  for (const thread of state.threads) {
    if (!bestieThreadShouldCheckForNewerMessages(thread, pendingId)) continue;
    const lastSummaryAt = thread.lastSummaryAt;
    if (lastSummaryAt == null) continue;

    try {
      const newest = await loadNewestThreadReplyCreatedAt(
        thread.channelId,
        thread.rootEventId,
        fetchReplies,
      );
      if (newest == null || newest <= lastSummaryAt) continue;
      upsertBestieTrackedThreadForScope(scope, {
        channelId: thread.channelId,
        channelName: thread.channelName,
        lastActiveAt: newest,
        preview: thread.preview,
        rootEventId: thread.rootEventId,
        source: thread.source,
      });
    } catch {
      // Best-effort: a failed fetch must not throw out of the interval.
    }
  }
}
