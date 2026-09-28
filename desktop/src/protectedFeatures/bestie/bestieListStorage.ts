import { canonicalRelayUrl } from "@/features/agents/managedAgentRuntimeStatus";

import type {
  BestieListAddInput,
  BestieListItem,
  BestieListKind,
  BestieListScope,
  BestieListState,
  BestieListTodoUpdateInput,
} from "./bestieListTypes";

/** Local YYYY-MM-DD for todo day grouping. */
export function localDayKeyFromSeconds(seconds: number): string {
  const date = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayLocalDayKey(
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  return localDayKeyFromSeconds(nowSeconds);
}

export const BESTIE_LIST_STORAGE_PREFIX = "buzz-bestie-list.v1";

export function bestieListStorageKey(scope: BestieListScope): string {
  const relay =
    canonicalRelayUrl(scope.relayUrl) ?? scope.relayUrl.trim().toLowerCase();
  return [
    BESTIE_LIST_STORAGE_PREFIX,
    relay,
    scope.ownerPubkey.toLowerCase(),
    scope.agentPubkey.toLowerCase(),
  ].join(":");
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isKind(value: unknown): value is BestieListKind {
  return value === "todo" || value === "reminder";
}

/** Shared empty snapshot — stable Object.is for useSyncExternalStore. */
export const EMPTY_BESTIE_LIST_STATE: BestieListState = Object.freeze({
  items: Object.freeze([]) as unknown as BestieListItem[],
  processedMessageIds: Object.freeze([]) as unknown as string[],
  version: 1,
});

export function emptyBestieListState(): BestieListState {
  return EMPTY_BESTIE_LIST_STATE;
}

export function parseBestieListItem(value: unknown): BestieListItem | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    !isKind(record.kind) ||
    typeof record.text !== "string" ||
    record.text.trim().length === 0 ||
    (record.status !== "open" && record.status !== "done") ||
    !isFiniteNonNegative(record.createdAt) ||
    !isFiniteNonNegative(record.updatedAt)
  ) {
    return null;
  }
  const dueAt =
    record.dueAt == null
      ? null
      : isFiniteNonNegative(record.dueAt)
        ? record.dueAt
        : null;
  const sourceMessageId =
    typeof record.sourceMessageId === "string" &&
    record.sourceMessageId.length > 0
      ? record.sourceMessageId
      : null;
  const starred = record.starred === true;
  const sortOrder = isFiniteNonNegative(record.sortOrder)
    ? Math.floor(record.sortOrder)
    : Math.floor(record.createdAt);
  const dayKey =
    typeof record.dayKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.dayKey)
      ? record.dayKey
      : record.kind === "todo"
        ? localDayKeyFromSeconds(record.createdAt)
        : null;
  return {
    createdAt: record.createdAt,
    dayKey,
    dueAt,
    id: record.id,
    kind: record.kind,
    sortOrder,
    sourceMessageId,
    starred,
    status: record.status,
    text: record.text.trim(),
    updatedAt: record.updatedAt,
  };
}

export function parseBestieListState(value: unknown): BestieListState | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.items)) return null;
  const items: BestieListItem[] = [];
  for (const entry of record.items) {
    const item = parseBestieListItem(entry);
    if (item) items.push(item);
  }
  const processedMessageIds = Array.isArray(record.processedMessageIds)
    ? record.processedMessageIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  return { items, processedMessageIds, version: 1 };
}

export function readBestieListState(scope: BestieListScope): BestieListState {
  try {
    const raw = window.localStorage.getItem(bestieListStorageKey(scope));
    if (!raw) return emptyBestieListState();
    return parseBestieListState(JSON.parse(raw)) ?? emptyBestieListState();
  } catch {
    return emptyBestieListState();
  }
}

export function writeBestieListState(
  scope: BestieListScope,
  state: BestieListState,
): void {
  try {
    window.localStorage.setItem(
      bestieListStorageKey(scope),
      JSON.stringify(state),
    );
  } catch {
    // Quota / private mode — callers still hold in-memory state.
  }
}

export function createBestieListItemId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `bestie-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Due times within this many seconds count as the same reminder slot. */
export const BESTIE_LIST_DUE_DEDUPE_WINDOW_SECONDS = 120;

/**
 * Recent open items with the same kind+text count as duplicates even when
 * dueAt differs (NL client path vs agent fence often disagree slightly).
 */
export const BESTIE_LIST_RECENT_DEDUPE_SECONDS = 600;

function normalizeListText(text: string): string {
  return text.trim().toLowerCase();
}

function dueAtsMatch(
  existing: number | null,
  incoming: number | null,
): boolean {
  if (existing == null && incoming == null) return true;
  if (existing == null || incoming == null) return false;
  return Math.abs(existing - incoming) <= BESTIE_LIST_DUE_DEDUPE_WINDOW_SECONDS;
}

/**
 * Find an open item that would duplicate this add (NL + agent fence case).
 * Matches on kind + normalized text, then due window or recent creation.
 */
export function findDuplicateBestieListItem(
  state: BestieListState,
  input: BestieListAddInput,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieListItem | null {
  const needle = normalizeListText(input.text);
  if (!needle) return null;
  const incomingDue = input.kind === "reminder" ? (input.dueAt ?? null) : null;
  for (const item of state.items) {
    if (item.status !== "open") continue;
    if (item.kind !== input.kind) continue;
    if (normalizeListText(item.text) !== needle) continue;
    if (dueAtsMatch(item.dueAt, incomingDue)) return item;
    if (nowSeconds - item.createdAt <= BESTIE_LIST_RECENT_DEDUPE_SECONDS) {
      return item;
    }
  }
  return null;
}

export function addBestieListItem(
  state: BestieListState,
  input: BestieListAddInput,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieListState {
  const text = input.text.trim();
  if (!text) return state;
  // One user ask must not create two rows (NL + agent fence use different
  // message ids, so processedMessageIds alone is not enough).
  if (findDuplicateBestieListItem(state, input, nowSeconds)) {
    return state;
  }
  const minOrder = state.items.reduce(
    (min, item) => Math.min(min, item.sortOrder),
    nowSeconds,
  );
  const sortOrder =
    input.sortOrder != null && Number.isFinite(input.sortOrder)
      ? Math.floor(input.sortOrder)
      : minOrder - 1;
  const dayKey =
    input.kind === "todo"
      ? input.dayKey && /^\d{4}-\d{2}-\d{2}$/.test(input.dayKey)
        ? input.dayKey
        : localDayKeyFromSeconds(nowSeconds)
      : null;
  const item: BestieListItem = {
    createdAt: nowSeconds,
    dayKey,
    dueAt: input.kind === "reminder" ? (input.dueAt ?? null) : null,
    id: createBestieListItemId(),
    kind: input.kind,
    sortOrder,
    sourceMessageId: input.sourceMessageId ?? null,
    starred: input.kind === "todo" ? input.starred === true : false,
    status: "open",
    text,
    updatedAt: nowSeconds,
  };
  return {
    ...state,
    items: [item, ...state.items],
  };
}

export function updateBestieListItemStatus(
  state: BestieListState,
  id: string,
  status: BestieListItem["status"],
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieListState {
  return {
    ...state,
    items: state.items.map((item) =>
      item.id === id ? { ...item, status, updatedAt: nowSeconds } : item,
    ),
  };
}

export function removeBestieListItem(
  state: BestieListState,
  id: string,
): BestieListState {
  return {
    ...state,
    items: state.items.filter((item) => item.id !== id),
  };
}

export function markBestieListMessageProcessed(
  state: BestieListState,
  messageId: string,
): BestieListState {
  if (state.processedMessageIds.includes(messageId)) return state;
  const processedMessageIds = [...state.processedMessageIds, messageId];
  // Cap history so localStorage stays bounded.
  const trimmed =
    processedMessageIds.length > 200
      ? processedMessageIds.slice(processedMessageIds.length - 200)
      : processedMessageIds;
  return { ...state, processedMessageIds: trimmed };
}

export function openTodos(state: BestieListState): BestieListItem[] {
  return state.items.filter(
    (item) => item.kind === "todo" && item.status === "open",
  );
}

export function openReminders(state: BestieListState): BestieListItem[] {
  return state.items.filter(
    (item) => item.kind === "reminder" && item.status === "open",
  );
}

export function dueReminders(
  state: BestieListState,
  nowSeconds: number,
): BestieListItem[] {
  return openReminders(state).filter(
    (item) => item.dueAt != null && item.dueAt <= nowSeconds,
  );
}

export function updateBestieListItem(
  state: BestieListState,
  input: BestieListTodoUpdateInput,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieListState {
  let changed = false;
  const items = state.items.map((item) => {
    if (item.id !== input.id) return item;
    changed = true;
    const next: BestieListItem = { ...item, updatedAt: nowSeconds };
    if (input.starred != null) next.starred = input.starred;
    if (input.sortOrder != null && Number.isFinite(input.sortOrder)) {
      next.sortOrder = Math.floor(input.sortOrder);
    }
    if (input.dayKey !== undefined) {
      next.dayKey =
        input.dayKey && /^\d{4}-\d{2}-\d{2}$/.test(input.dayKey)
          ? input.dayKey
          : item.kind === "todo"
            ? localDayKeyFromSeconds(item.createdAt)
            : null;
    }
    if (input.status != null) next.status = input.status;
    if (typeof input.text === "string" && input.text.trim()) {
      next.text = input.text.trim();
    }
    return next;
  });
  return changed ? { ...state, items } : state;
}

export function toggleBestieListItemStarred(
  state: BestieListState,
  id: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieListState {
  const item = state.items.find((entry) => entry.id === id);
  if (!item || item.kind !== "todo") return state;
  return updateBestieListItem(
    state,
    { id, starred: !item.starred },
    nowSeconds,
  );
}

/**
 * Reorder todos after a drag. `orderedIds` is the full open-todo order within
 * the destination group (starred block or a dayKey). Updates sortOrder and
 * optionally dayKey / starred for the moved item.
 */
export function reorderBestieTodos(
  state: BestieListState,
  options: {
    /** Destination day for non-starred drops; ignored when starred. */
    dayKey?: string | null;
    orderedIds: string[];
    /** When true, items in orderedIds become starred; when false, unstarred. */
    starred: boolean;
  },
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieListState {
  const orderIndex = new Map(
    options.orderedIds.map((id, index) => [id, index]),
  );
  if (orderIndex.size === 0) return state;
  const items = state.items.map((item) => {
    if (item.kind !== "todo") return item;
    const index = orderIndex.get(item.id);
    if (index == null) return item;
    return {
      ...item,
      dayKey: options.starred
        ? item.dayKey ?? localDayKeyFromSeconds(item.createdAt)
        : options.dayKey && /^\d{4}-\d{2}-\d{2}$/.test(options.dayKey)
          ? options.dayKey
          : item.dayKey ?? localDayKeyFromSeconds(nowSeconds),
      sortOrder: index,
      starred: options.starred,
      updatedAt: nowSeconds,
    };
  });
  return { ...state, items };
}
