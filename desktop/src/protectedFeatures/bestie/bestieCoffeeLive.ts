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
import type { BestieCoffeePendingRun } from "./bestieCoffeeTypes";

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
  pendingRun: BestieCoffeePendingRun | null;
}): boolean {
  const { agentWorkingOnBestieDm, nowSeconds, pendingRun } = options;
  const openTriggerAt = options.openCoffeeTriggerAt ?? null;

  if (pendingRun) {
    if (agentWorkingOnBestieDm) return true;
    const age = nowSeconds - pendingRun.startedAt;
    if (age >= 0 && age <= BESTIE_COFFEE_START_GRACE_SECONDS) return true;
    return false;
  }

  // Manual / scheduled path without a local lock: ACP working after a coffee trigger.
  if (agentWorkingOnBestieDm && openTriggerAt != null) {
    return openTriggerAt <= nowSeconds;
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
  pendingRun: BestieCoffeePendingRun | null;
}): boolean {
  if (
    isBestieCoffeeLive({
      agentWorkingOnBestieDm: options.agentWorkingOnBestieDm,
      nowSeconds: options.nowSeconds,
      openCoffeeTriggerAt: options.openCoffeeTriggerAt,
      pendingRun: options.pendingRun,
    })
  ) {
    return true;
  }
  // Fresh pending before live grace evaluation edge — still block double Brew.
  const pending = options.pendingRun;
  if (!pending) return false;
  const age = options.nowSeconds - pending.startedAt;
  return age >= 0 && age <= BESTIE_COFFEE_START_GRACE_SECONDS;
}
