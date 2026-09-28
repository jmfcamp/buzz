/**
 * Coffee schedule helpers.
 *
 * Default morning time is 08:00 in the *local* timezone (Date#setHours),
 * matching Jobs daily schedules. JM’s machine is America/Phoenix; other
 * users get their OS local time. Prefs live on BestieCoffeeState for a
 * later settings UI — no separate prefs store yet.
 */

import type {
  BestieCoffeePrefs,
  BestieCoffeeState,
} from "./bestieCoffeeTypes";

/** Reasonable default morning coffee time (local). */
export const BESTIE_COFFEE_DEFAULT_HOUR = 8;
export const BESTIE_COFFEE_DEFAULT_MINUTE = 0;

export const DEFAULT_BESTIE_COFFEE_PREFS: BestieCoffeePrefs = Object.freeze({
  hour: BESTIE_COFFEE_DEFAULT_HOUR,
  minute: BESTIE_COFFEE_DEFAULT_MINUTE,
});

/** Marker prefix on the user turn that kicks off /hula-coffee. */
export const BESTIE_COFFEE_RUN_MARKER = "[Bestie coffee]";

/** Slash skill Bestie should run (lives on JM’s Mac at ~/.claude/skills/hula-coffee). */
export const BESTIE_COFFEE_SKILL_COMMAND = "/hula-coffee";

/** Window event: Coffee sheet Brew clicked — WakeController sends the turn. */
export const BESTIE_COFFEE_BREW_EVENT = "buzz:bestie-coffee-brew";


export function formatBestieCoffeeRunPrompt(): string {
  return `${BESTIE_COFFEE_RUN_MARKER}\n\n${BESTIE_COFFEE_SKILL_COMMAND}`;
}

export function clampCoffeeHour(hour: number): number {
  if (!Number.isFinite(hour)) return BESTIE_COFFEE_DEFAULT_HOUR;
  return Math.min(23, Math.max(0, Math.floor(hour)));
}

export function clampCoffeeMinute(minute: number): number {
  if (!Number.isFinite(minute)) return BESTIE_COFFEE_DEFAULT_MINUTE;
  return Math.min(59, Math.max(0, Math.floor(minute)));
}

export function normalizeCoffeePrefs(
  prefs: Partial<BestieCoffeePrefs> | null | undefined,
): BestieCoffeePrefs {
  return {
    hour: clampCoffeeHour(prefs?.hour ?? BESTIE_COFFEE_DEFAULT_HOUR),
    minute: clampCoffeeMinute(prefs?.minute ?? BESTIE_COFFEE_DEFAULT_MINUTE),
  };
}

/** Local calendar day key YYYY-MM-DD for `nowSeconds`. */
export function localDayKey(nowSeconds: number): string {
  const date = new Date(nowSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Unix seconds of today’s coffee time (local), or tomorrow if afterRun. */
export function nextCoffeeDueAt(
  prefs: BestieCoffeePrefs,
  fromSeconds: number,
  options?: { afterRun?: boolean },
): number {
  const normalized = normalizeCoffeePrefs(prefs);
  const base = new Date(fromSeconds * 1000);
  const candidate = new Date(base);
  candidate.setSeconds(0, 0);
  candidate.setHours(normalized.hour, normalized.minute, 0, 0);
  let due = Math.floor(candidate.getTime() / 1000);
  if (options?.afterRun || due <= fromSeconds) {
    candidate.setDate(candidate.getDate() + 1);
    due = Math.floor(candidate.getTime() / 1000);
  }
  return due;
}

export function isAtOrPastCoffeeTime(
  prefs: BestieCoffeePrefs,
  nowSeconds: number,
): boolean {
  const normalized = normalizeCoffeePrefs(prefs);
  const date = new Date(nowSeconds * 1000);
  const minutesNow = date.getHours() * 60 + date.getMinutes();
  const minutesDue = normalized.hour * 60 + normalized.minute;
  return minutesNow >= minutesDue;
}

/**
 * True when the Bestie agent is considered online for scheduled coffee.
 * Uses relay presence (`online` only — not away/offline/unknown).
 */
export function isBestieAgentOnlineForCoffee(
  presenceStatus: string | null | undefined,
): boolean {
  return presenceStatus === "online";
}

export type CoffeeScheduleGateReason =
  | "ok"
  | "offline"
  | "before-schedule"
  | "already-ran-today"
  | "brewing"
  | "no-scope";

/**
 * Decide whether the automatic morning coffee should fire now.
 * Brew bypasses this (manual) but still respects the brewing lock.
 */
export function coffeeScheduleGate(options: {
  isAgentOnline: boolean;
  nowSeconds: number;
  state: BestieCoffeeState;
}): { ok: boolean; reason: CoffeeScheduleGateReason } {
  const { isAgentOnline, nowSeconds, state } = options;
  if (state.pendingRun) return { ok: false, reason: "brewing" };
  if (!isAgentOnline) return { ok: false, reason: "offline" };
  if (!isAtOrPastCoffeeTime(state.prefs, nowSeconds)) {
    return { ok: false, reason: "before-schedule" };
  }
  const today = localDayKey(nowSeconds);
  if (state.lastScheduledDayKey === today) {
    return { ok: false, reason: "already-ran-today" };
  }
  // Also treat a completed scheduled entry today as done (prefs day key may lag).
  const hasScheduledToday = state.entries.some(
    (entry) =>
      entry.source === "scheduled" && localDayKey(entry.ranAt) === today,
  );
  if (hasScheduledToday) return { ok: false, reason: "already-ran-today" };
  return { ok: true, reason: "ok" };
}

/** One-sentence brief from full skill output. */
export function deriveBestieCoffeeBrief(fullOutput: string): string {
  const cleaned = fullOutput
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Coffee briefing (empty output).";
  // Prefer first sentence-ish chunk.
  const sentenceMatch = cleaned.match(/^(.{1,160}?[.!?])(?:\s|$)/);
  if (sentenceMatch?.[1]) return sentenceMatch[1].trim();
  if (cleaned.length <= 140) return cleaned;
  return `${cleaned.slice(0, 137).trimEnd()}…`;
}
