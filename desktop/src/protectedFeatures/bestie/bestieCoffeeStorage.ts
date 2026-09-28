import { canonicalRelayUrl } from "@/features/agents/managedAgentRuntimeStatus";

import {
  DEFAULT_BESTIE_COFFEE_PREFS,
  deriveBestieCoffeeBrief,
  localDayKey,
  normalizeCoffeePrefs,
} from "./bestieCoffeeSchedule";
import type {
  BestieCoffeeAddEntryInput,
  BestieCoffeeEntry,
  BestieCoffeePendingRun,
  BestieCoffeePrefs,
  BestieCoffeeRunSource,
  BestieCoffeeScope,
  BestieCoffeeState,
} from "./bestieCoffeeTypes";

export const BESTIE_COFFEE_STORAGE_PREFIX = "buzz-bestie-coffee.v1";

/** Cap stored briefings so localStorage stays bounded. */
export const BESTIE_COFFEE_MAX_ENTRIES = 60;

export function bestieCoffeeStorageKey(scope: BestieCoffeeScope): string {
  const relay =
    canonicalRelayUrl(scope.relayUrl) ?? scope.relayUrl.trim().toLowerCase();
  return [
    BESTIE_COFFEE_STORAGE_PREFIX,
    relay,
    scope.ownerPubkey.toLowerCase(),
    scope.agentPubkey.toLowerCase(),
  ].join(":");
}

export const EMPTY_BESTIE_COFFEE_STATE: BestieCoffeeState = Object.freeze({
  entries: Object.freeze([]) as unknown as BestieCoffeeEntry[],
  lastScheduledDayKey: null,
  pendingRun: null,
  prefs: DEFAULT_BESTIE_COFFEE_PREFS,
  version: 1,
});

export function emptyBestieCoffeeState(): BestieCoffeeState {
  return EMPTY_BESTIE_COFFEE_STATE;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseEntry(value: unknown): BestieCoffeeEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    !isFiniteNonNegative(record.ranAt) ||
    typeof record.brief !== "string" ||
    typeof record.fullOutput !== "string" ||
    (record.source !== "scheduled" && record.source !== "brew")
  ) {
    return null;
  }
  const triggerMessageId =
    typeof record.triggerMessageId === "string" &&
    record.triggerMessageId.length > 0
      ? record.triggerMessageId
      : null;
  const replyMessageId =
    typeof record.replyMessageId === "string" &&
    record.replyMessageId.length > 0
      ? record.replyMessageId
      : null;
  return {
    brief: record.brief.trim() || deriveBestieCoffeeBrief(record.fullOutput),
    fullOutput: record.fullOutput,
    id: record.id,
    ranAt: Math.floor(record.ranAt),
    replyMessageId,
    source: record.source,
    triggerMessageId,
  };
}

function parsePending(value: unknown): BestieCoffeePendingRun | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    (record.source !== "scheduled" && record.source !== "brew") ||
    !isFiniteNonNegative(record.startedAt)
  ) {
    return null;
  }
  const triggerMessageId =
    typeof record.triggerMessageId === "string" &&
    record.triggerMessageId.length > 0
      ? record.triggerMessageId
      : null;
  return {
    source: record.source,
    startedAt: Math.floor(record.startedAt),
    triggerMessageId,
  };
}

export function parseBestieCoffeeState(
  value: unknown,
): BestieCoffeeState | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.entries)) return null;
  const entries: BestieCoffeeEntry[] = [];
  for (const entry of record.entries) {
    const parsed = parseEntry(entry);
    if (parsed) entries.push(parsed);
  }
  const prefs = normalizeCoffeePrefs(
    typeof record.prefs === "object" && record.prefs !== null
      ? (record.prefs as BestieCoffeePrefs)
      : undefined,
  );
  const lastScheduledDayKey =
    typeof record.lastScheduledDayKey === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.lastScheduledDayKey)
      ? record.lastScheduledDayKey
      : null;
  return {
    entries,
    lastScheduledDayKey,
    pendingRun: parsePending(record.pendingRun),
    prefs,
    version: 1,
  };
}

export function readBestieCoffeeState(
  scope: BestieCoffeeScope,
): BestieCoffeeState {
  try {
    const raw = window.localStorage.getItem(bestieCoffeeStorageKey(scope));
    if (!raw) return emptyBestieCoffeeState();
    return parseBestieCoffeeState(JSON.parse(raw)) ?? emptyBestieCoffeeState();
  } catch {
    return emptyBestieCoffeeState();
  }
}

export function writeBestieCoffeeState(
  scope: BestieCoffeeScope,
  state: BestieCoffeeState,
): void {
  try {
    window.localStorage.setItem(
      bestieCoffeeStorageKey(scope),
      JSON.stringify(state),
    );
  } catch {
    // Quota / private mode — callers still hold in-memory state.
  }
}

export function createBestieCoffeeEntryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `coffee-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function setBestieCoffeePrefs(
  state: BestieCoffeeState,
  prefs: Partial<BestieCoffeePrefs>,
): BestieCoffeeState {
  return {
    ...state,
    prefs: normalizeCoffeePrefs({ ...state.prefs, ...prefs }),
  };
}

export function beginBestieCoffeeRun(
  state: BestieCoffeeState,
  source: BestieCoffeeRunSource,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieCoffeeState | null {
  if (state.pendingRun) return null;
  return {
    ...state,
    pendingRun: {
      source,
      startedAt: nowSeconds,
      triggerMessageId: null,
    },
  };
}

export function setBestieCoffeePendingTrigger(
  state: BestieCoffeeState,
  triggerMessageId: string | null,
): BestieCoffeeState {
  if (!state.pendingRun) return state;
  return {
    ...state,
    pendingRun: { ...state.pendingRun, triggerMessageId },
  };
}

export function clearBestieCoffeePendingRun(
  state: BestieCoffeeState,
): BestieCoffeeState {
  if (!state.pendingRun) return state;
  return { ...state, pendingRun: null };
}

export function completeBestieCoffeeRun(
  state: BestieCoffeeState,
  input: BestieCoffeeAddEntryInput,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieCoffeeState {
  const source = state.pendingRun?.source ?? input.source;
  const brief =
    input.brief.trim() || deriveBestieCoffeeBrief(input.fullOutput);
  const entry: BestieCoffeeEntry = {
    brief,
    fullOutput: input.fullOutput,
    id: createBestieCoffeeEntryId(),
    ranAt: nowSeconds,
    replyMessageId: input.replyMessageId ?? null,
    source,
    triggerMessageId:
      input.triggerMessageId ?? state.pendingRun?.triggerMessageId ?? null,
  };
  const entries = [entry, ...state.entries].slice(0, BESTIE_COFFEE_MAX_ENTRIES);
  const lastScheduledDayKey =
    source === "scheduled"
      ? localDayKey(nowSeconds)
      : state.lastScheduledDayKey;
  return {
    ...state,
    entries,
    lastScheduledDayKey,
    pendingRun: null,
  };
}

export function removeBestieCoffeeEntry(
  state: BestieCoffeeState,
  id: string,
): BestieCoffeeState {
  const entries = state.entries.filter((entry) => entry.id !== id);
  if (entries.length === state.entries.length) return state;
  return { ...state, entries };
}

export function isBestieCoffeeBrewing(state: BestieCoffeeState): boolean {
  return state.pendingRun != null;
}
