import { dueReminders, openTodos } from "./bestieListStorage";
import type { BestieListState } from "./bestieListTypes";
import type { BestieNudge } from "./bestieNudgeStore";

/** Default autonomous wake cadence (~5 minutes). */
export const BESTIE_WAKE_INTERVAL_MS = 5 * 60 * 1000;

export type BestieWakeEvaluation = {
  nudge: BestieNudge | null;
  /** True when the Bestie agent should be ensured running. */
  shouldWakeAgent: boolean;
};

/**
 * Pure wake evaluator: due reminders + open todos → proactive nudge payload.
 * Distinct from normal DM unread — callers surface via footer/popover chrome.
 */
export function evaluateBestieWake(
  state: BestieListState,
  nowSeconds: number,
  options?: { previousNudgeId?: string | null },
): BestieWakeEvaluation {
  const due = dueReminders(state, nowSeconds);
  const todos = openTodos(state);
  if (due.length === 0 && todos.length === 0) {
    return { nudge: null, shouldWakeAgent: false };
  }

  const itemIds = [...due, ...todos].map((item) => item.id);
  const fingerprint = `${due
    .map((d) => d.id)
    .sort()
    .join(",")}|${todos
    .map((t) => t.id)
    .sort()
    .join(",")}`;
  const id = `wake:${fingerprint}`;
  if (options?.previousNudgeId === id) {
    // Same outstanding set — keep badge, don't re-fire wake storm.
    return {
      nudge: null,
      shouldWakeAgent: false,
    };
  }

  const parts: string[] = [];
  if (due.length > 0) {
    parts.push(
      due.length === 1
        ? `Reminder: ${due[0].text}`
        : `${due.length} reminders are due`,
    );
  }
  if (todos.length > 0) {
    parts.push(
      todos.length === 1
        ? `Open to-do: ${todos[0].text}`
        : `${todos.length} open to-dos`,
    );
  }

  return {
    nudge: {
      body: parts.join(" · "),
      createdAt: nowSeconds,
      id,
      itemIds,
      title: "Bestie check-in",
    },
    shouldWakeAgent: true,
  };
}

export type BestieWakeSchedulerHandles = {
  stop: () => void;
  /** Fire one evaluation immediately (also used by tests). */
  tick: () => BestieWakeEvaluation;
};

/**
 * Interval wake loop. Call `stop()` on unmount.
 * `onWakeAgent` should be best-effort (ensure agent running).
 */
export function startBestieWakeScheduler(options: {
  getListState: () => BestieListState;
  getPreviousNudgeId: () => string | null;
  intervalMs?: number;
  nowSeconds?: () => number;
  onNudge: (nudge: BestieNudge) => void;
  onWakeAgent: () => void;
}): BestieWakeSchedulerHandles {
  let lastEmittedId: string | null = options.getPreviousNudgeId();
  const intervalMs = options.intervalMs ?? BESTIE_WAKE_INTERVAL_MS;

  const tick = (): BestieWakeEvaluation => {
    const now = options.nowSeconds?.() ?? Math.floor(Date.now() / 1000);
    const evaluation = evaluateBestieWake(options.getListState(), now, {
      previousNudgeId: lastEmittedId,
    });
    if (evaluation.nudge) {
      lastEmittedId = evaluation.nudge.id;
      options.onNudge(evaluation.nudge);
    }
    if (evaluation.shouldWakeAgent) {
      try {
        options.onWakeAgent();
      } catch {
        // Wake is best-effort; nudge UI still surfaces.
      }
    }
    return evaluation;
  };

  const timer = window.setInterval(tick, intervalMs);
  return {
    stop: () => window.clearInterval(timer),
    tick,
  };
}
