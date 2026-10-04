/** When the Threads Summarize button should show for a tracked row. */

import type { BestieTrackedThread } from "./bestieThreadTypes";

/**
 * Summarize is available when the thread has never been summarized, or when
 * there has been newer activity (`lastActiveAt`) since `lastSummaryAt`.
 */
export function bestieThreadNeedsSummarize(
  thread: Pick<BestieTrackedThread, "lastActiveAt" | "lastSummaryAt">,
): boolean {
  if (thread.lastSummaryAt == null) return true;
  return thread.lastActiveAt > thread.lastSummaryAt;
}

/**
 * Idle button label (not live / pending):
 * - "Resummarize" when already summarized AND needs summarize again
 * - "Summarize" otherwise (including first-time never-summarized)
 */
export function bestieThreadSummarizeIdleLabel(
  thread: Pick<BestieTrackedThread, "lastActiveAt" | "lastSummaryAt">,
): "Summarize" | "Resummarize" {
  if (thread.lastSummaryAt != null && bestieThreadNeedsSummarize(thread)) {
    return "Resummarize";
  }
  return "Summarize";
}
