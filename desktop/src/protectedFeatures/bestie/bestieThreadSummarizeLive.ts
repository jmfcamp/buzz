/**
 * Threads Summarize "live" UI — same rules as Coffee brewing:
 * show 🤔… only while the actual summarize turn is in flight on the
 * Assistant DM, not while Coffee / Jobs / Reminder notifies own ACP.
 */

import { BESTIE_COFFEE_RUN_MARKER } from "./bestieCoffeeSchedule";
import { BESTIE_JOB_RUN_MARKER } from "./bestieJobSchedule";
import {
  BESTIE_THREAD_SUMMARIZE_MARKER,
} from "./bestieThreadProtocol";
import type { BestieThreadPendingSummarize } from "./bestieThreadTypes";

/** Shared with Coffee — thinking face while the turn is live. */
export const BESTIE_THREAD_SUMMARIZE_LIVE_LABEL = "🤔…";

export const BESTIE_THREAD_SUMMARIZE_START_GRACE_SECONDS = 15;
export const BESTIE_THREAD_SUMMARIZE_STALE_PENDING_SECONDS = 20 * 60;

const BESTIE_REMINDER_NOTIFY_MARKER = "[Bestie reminder]";

export function messageLooksLikeBestieSummarizeTrigger(content: string): boolean {
  if (!content) return false;
  return content.includes(BESTIE_THREAD_SUMMARIZE_MARKER);
}

/**
 * Owner system turns that are *not* summarize but still wake ACP on the
 * Assistant DM. When newer than the summarize trigger / pending start,
 * 🤔… must not claim a summarize run.
 */
export function messageLooksLikeBestieSummarizeCompetingTrigger(
  content: string,
): boolean {
  if (!content) return false;
  if (content.includes(BESTIE_COFFEE_RUN_MARKER)) return true;
  if (content.includes(BESTIE_JOB_RUN_MARKER)) return true;
  if (content.includes(BESTIE_REMINDER_NOTIFY_MARKER)) return true;
  return false;
}

export function isBestieThreadSummarizeLive(options: {
  agentWorkingOnBestieDm: boolean;
  nowSeconds: number;
  openSummarizeTriggerAt?: number | null;
  latestCompetingTriggerAt?: number | null;
  pendingSummarize: BestieThreadPendingSummarize | null;
}): boolean {
  const { agentWorkingOnBestieDm, nowSeconds, pendingSummarize } = options;
  const openTriggerAt = options.openSummarizeTriggerAt ?? null;
  const competingAt = options.latestCompetingTriggerAt ?? null;

  const summarizeStillLatestOpen = (at: number): boolean =>
    competingAt == null || at >= competingAt;

  if (pendingSummarize) {
    const age = nowSeconds - pendingSummarize.startedAt;
    if (age >= 0 && age <= BESTIE_THREAD_SUMMARIZE_START_GRACE_SECONDS) {
      if (!summarizeStillLatestOpen(pendingSummarize.startedAt)) return false;
      return true;
    }
    if (
      agentWorkingOnBestieDm &&
      summarizeStillLatestOpen(pendingSummarize.startedAt)
    ) {
      return true;
    }
    return false;
  }

  if (
    agentWorkingOnBestieDm &&
    openTriggerAt != null &&
    openTriggerAt <= nowSeconds &&
    summarizeStillLatestOpen(openTriggerAt)
  ) {
    return true;
  }

  return false;
}

export function isBestieThreadSummarizePendingStale(options: {
  agentWorkingOnBestieDm: boolean;
  nowSeconds: number;
  pendingSummarize: BestieThreadPendingSummarize | null;
}): boolean {
  const pending = options.pendingSummarize;
  if (!pending) return false;
  if (options.agentWorkingOnBestieDm) return false;
  const age = options.nowSeconds - pending.startedAt;
  if (age < 0) return false;
  if (age <= BESTIE_THREAD_SUMMARIZE_START_GRACE_SECONDS) return false;
  return age >= BESTIE_THREAD_SUMMARIZE_STALE_PENDING_SECONDS;
}

export function shouldDisableBestieThreadSummarize(options: {
  agentWorkingOnBestieDm: boolean;
  nowSeconds: number;
  openSummarizeTriggerAt?: number | null;
  latestCompetingTriggerAt?: number | null;
  pendingSummarize: BestieThreadPendingSummarize | null;
}): boolean {
  if (
    isBestieThreadSummarizeLive({
      agentWorkingOnBestieDm: options.agentWorkingOnBestieDm,
      nowSeconds: options.nowSeconds,
      openSummarizeTriggerAt: options.openSummarizeTriggerAt,
      latestCompetingTriggerAt: options.latestCompetingTriggerAt,
      pendingSummarize: options.pendingSummarize,
    })
  ) {
    return true;
  }
  const pending = options.pendingSummarize;
  if (!pending) return false;
  const competingAt = options.latestCompetingTriggerAt ?? null;
  if (competingAt != null && competingAt > pending.startedAt) return false;
  const age = options.nowSeconds - pending.startedAt;
  return age >= 0 && age <= BESTIE_THREAD_SUMMARIZE_START_GRACE_SECONDS;
}
