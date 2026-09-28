/**
 * Coffee "brewing" UI must track the real in-flight /hula-coffee turn — ACP
 * agent activity on the Assistant DM — not a sticky pendingRun spinner alone.
 *
 * ACP reacts 👀 ("seen"/queued) then 💬 ("working"). Eyes alone are not enough
 * for the Coffee tab; we show 🤔… while the turn is live and disable Brew.
 */

import {
  BESTIE_COFFEE_RUN_MARKER,
  BESTIE_COFFEE_SKILL_COMMAND,
} from "./bestieCoffeeSchedule";
import { BESTIE_JOB_RUN_MARKER } from "./bestieJobSchedule";
import { BESTIE_THREAD_SUMMARIZE_MARKER } from "./bestieThreadProtocol";
import type { BestieCoffeePendingRun } from "./bestieCoffeeTypes";

/** Reminder notify marker — kept local to avoid a WakeController import cycle. */
const BESTIE_REMINDER_NOTIFY_MARKER = "[Bestie reminder]";

/** Thinking-face + ellipsis shown on Coffee tab/sheet while a run is live. */
export const BESTIE_COFFEE_LIVE_LABEL = "🤔…";

/**
 * After Brew / schedule begins, ACP may still only have 👀 while the turn is
 * queued. Keep Brew disabled for this window even before observer "working".
 */
export const BESTIE_COFFEE_START_GRACE_SECONDS = 15;

/**
 * If pendingRun is still set, ACP is idle, and grace has elapsed, treat the
 * lock as stale so Brew cannot lie forever after a failed/abandoned turn.
 */
export const BESTIE_COFFEE_STALE_PENDING_SECONDS = 20 * 60;

export function messageLooksLikeBestieCoffeeTrigger(content: string): boolean {
  if (!content) return false;
  if (content.includes(BESTIE_COFFEE_RUN_MARKER)) return true;
  if (content.includes(BESTIE_COFFEE_SKILL_COMMAND)) return true;
  return /(^|\n)\s*\/hula-coffee(\s|$)/m.test(content);
}

/**
 * Owner turns that are *not* coffee but still wake ACP on the Assistant DM
 * (Thread Summarize, Jobs, Reminder notify). While one of these is the latest
 * open system turn, 🤔… / Brewing must not claim a coffee run.
 */
export function messageLooksLikeBestieCompetingSystemTrigger(
  content: string,
): boolean {
  if (!content) return false;
  if (content.includes(BESTIE_THREAD_SUMMARIZE_MARKER)) return true;
  if (content.includes(BESTIE_JOB_RUN_MARKER)) return true;
  if (content.includes(BESTIE_REMINDER_NOTIFY_MARKER)) return true;
  return false;
}

/** NIP-10 reply parent from kind:9 tags (explicit reply marker, else last e). */
export function replyParentIdFromEventTags(
  tags: readonly (readonly string[])[] | null | undefined,
): string | null {
  if (!tags || tags.length === 0) return null;
  let reply: string | null = null;
  let lastE: string | null = null;
  for (const tag of tags) {
    if (!tag || tag[0] !== "e" || !tag[1]) continue;
    lastE = tag[1];
    if (tag[3] === "reply") reply = tag[1];
  }
  return reply ?? lastE;
}

/**
 * True while /hula-coffee is actually in flight for Brew / schedule UI.
 *
 * - Prefer ACP agent-working on the Assistant DM once a coffee run is open.
 * - During start grace, stay live even if only 👀 has landed (not working yet).
 * - Optional `openCoffeeTriggerAt`: latest unmatched coffee user-turn time so a
 *   manual `/hula-coffee` (no pendingRun yet) still disables Brew while ACP works.
 */
export function isBestieCoffeeLive(options: {
  agentWorkingOnBestieDm: boolean;
  nowSeconds: number;
  openCoffeeTriggerAt?: number | null;
  /**
   * Latest owner system turn that is *not* coffee (summarize / job / reminder
   * notify). When newer than the coffee trigger / pending start, ACP working
   * belongs to that turn — do not show 🤔… as brewing.
   */
  latestCompetingTriggerAt?: number | null;
  pendingRun: BestieCoffeePendingRun | null;
}): boolean {
  const { agentWorkingOnBestieDm, nowSeconds, pendingRun } = options;
  const openTriggerAt = options.openCoffeeTriggerAt ?? null;
  const competingAt = options.latestCompetingTriggerAt ?? null;

  const coffeeStillLatestOpen = (coffeeAt: number): boolean =>
    competingAt == null || coffeeAt >= competingAt;

  if (pendingRun) {
    const age = nowSeconds - pendingRun.startedAt;
    // Queued 👀 window after Brew/schedule — coffee owns this even before ACP working.
    if (age >= 0 && age <= BESTIE_COFFEE_START_GRACE_SECONDS) {
      // If a newer summarize/job already started, grace no longer applies.
      if (!coffeeStillLatestOpen(pendingRun.startedAt)) return false;
      return true;
    }
    // ACP working only counts as coffee when coffee is still the latest system turn.
    if (agentWorkingOnBestieDm && coffeeStillLatestOpen(pendingRun.startedAt)) {
      return true;
    }
    return false;
  }

  // Manual /hula-coffee without local lock: only while ACP works *and* coffee
  // is still the latest open system trigger (not Thread Summarize, etc.).
  if (
    agentWorkingOnBestieDm &&
    openTriggerAt != null &&
    openTriggerAt <= nowSeconds &&
    coffeeStillLatestOpen(openTriggerAt)
  ) {
    return true;
  }

  return false;
}

/** Pending lock that survived past grace with no ACP activity — safe to clear. */
export function isBestieCoffeePendingStale(options: {
  agentWorkingOnBestieDm: boolean;
  nowSeconds: number;
  pendingRun: BestieCoffeePendingRun | null;
}): boolean {
  const pending = options.pendingRun;
  if (!pending) return false;
  if (options.agentWorkingOnBestieDm) return false;
  const age = options.nowSeconds - pending.startedAt;
  if (age < 0) return false;
  if (age <= BESTIE_COFFEE_START_GRACE_SECONDS) return false;
  return age >= BESTIE_COFFEE_STALE_PENDING_SECONDS;
}

/**
 * Disable Brew when a coffee turn is live, or while we still hold a fresh
 * pending lock (grace window / about to send).
 */
export function shouldDisableBestieCoffeeBrew(options: {
  agentWorkingOnBestieDm: boolean;
  nowSeconds: number;
  openCoffeeTriggerAt?: number | null;
  latestCompetingTriggerAt?: number | null;
  pendingRun: BestieCoffeePendingRun | null;
}): boolean {
  if (
    isBestieCoffeeLive({
      agentWorkingOnBestieDm: options.agentWorkingOnBestieDm,
      nowSeconds: options.nowSeconds,
      openCoffeeTriggerAt: options.openCoffeeTriggerAt,
      latestCompetingTriggerAt: options.latestCompetingTriggerAt,
      pendingRun: options.pendingRun,
    })
  ) {
    return true;
  }
  // Fresh pending before live grace evaluation edge — still block double Brew.
  const pending = options.pendingRun;
  if (!pending) return false;
  const competingAt = options.latestCompetingTriggerAt ?? null;
  if (competingAt != null && competingAt > pending.startedAt) return false;
  const age = options.nowSeconds - pending.startedAt;
  return age >= 0 && age <= BESTIE_COFFEE_START_GRACE_SECONDS;
}
