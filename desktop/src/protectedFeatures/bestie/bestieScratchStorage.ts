import { canonicalRelayUrl } from "@/features/agents/managedAgentRuntimeStatus";

import type {
  BestieScratchAddInput,
  BestieScratchNote,
  BestieScratchScope,
  BestieScratchState,
  BestieScratchUpdateInput,
} from "./bestieScratchTypes";

export const BESTIE_SCRATCH_STORAGE_PREFIX = "buzz-bestie-scratch.v1";

/** Cap stored notes so localStorage stays bounded. */
export const BESTIE_SCRATCH_MAX_NOTES = 40;

export function bestieScratchStorageKey(scope: BestieScratchScope): string {
  const relay =
    canonicalRelayUrl(scope.relayUrl) ?? scope.relayUrl.trim().toLowerCase();
  return [
    BESTIE_SCRATCH_STORAGE_PREFIX,
    relay,
    scope.ownerPubkey.toLowerCase(),
    scope.agentPubkey.toLowerCase(),
  ].join(":");
}

export const EMPTY_BESTIE_SCRATCH_STATE: BestieScratchState = Object.freeze({
  notes: Object.freeze([]) as unknown as BestieScratchNote[],
  processedMessageIds: Object.freeze([]) as unknown as string[],
  version: 1,
});

export function emptyBestieScratchState(): BestieScratchState {
  return EMPTY_BESTIE_SCRATCH_STATE;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** First non-empty line, trimmed and capped — used when title is blank. */
export function deriveBestieScratchTitle(body: string, fallback = "Untitled"): string {
  const line =
    body
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0) ?? "";
  if (!line) return fallback;
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}

/** Short preview for list rows. */
export function bestieScratchSnippet(body: string, max = 96): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function parseBestieScratchNote(value: unknown): BestieScratchNote | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    typeof record.title !== "string" ||
    typeof record.body !== "string" ||
    !isFiniteNonNegative(record.createdAt) ||
    !isFiniteNonNegative(record.updatedAt)
  ) {
    return null;
  }
  const title = record.title.trim() || deriveBestieScratchTitle(record.body);
  const sourceMessageId =
    typeof record.sourceMessageId === "string" &&
    record.sourceMessageId.length > 0
      ? record.sourceMessageId
      : null;
  return {
    body: record.body,
    createdAt: Math.floor(record.createdAt),
    id: record.id,
    sourceMessageId,
    title,
    updatedAt: Math.floor(record.updatedAt),
  };
}

export function parseBestieScratchState(
  value: unknown,
): BestieScratchState | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.notes)) return null;
  const notes: BestieScratchNote[] = [];
  for (const entry of record.notes) {
    const note = parseBestieScratchNote(entry);
    if (note) notes.push(note);
  }
  const processedMessageIds = Array.isArray(record.processedMessageIds)
    ? record.processedMessageIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];
  return { notes, processedMessageIds, version: 1 };
}

export function readBestieScratchState(
  scope: BestieScratchScope,
): BestieScratchState {
  try {
    const raw = window.localStorage.getItem(bestieScratchStorageKey(scope));
    if (!raw) return emptyBestieScratchState();
    return parseBestieScratchState(JSON.parse(raw)) ?? emptyBestieScratchState();
  } catch {
    return emptyBestieScratchState();
  }
}

export function writeBestieScratchState(
  scope: BestieScratchScope,
  state: BestieScratchState,
): void {
  try {
    window.localStorage.setItem(
      bestieScratchStorageKey(scope),
      JSON.stringify(state),
    );
  } catch {
    // Quota / private mode — callers still hold in-memory state.
  }
}

export function createBestieScratchNoteId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `bestie-scratch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function addBestieScratchNote(
  state: BestieScratchState,
  input: BestieScratchAddInput,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieScratchState {
  const body = (input.body ?? "").trimEnd();
  const titleRaw = (input.title ?? "").trim();
  const title = titleRaw || deriveBestieScratchTitle(body);
  if (!titleRaw && !body.trim()) return state;

  const note: BestieScratchNote = {
    body,
    createdAt: nowSeconds,
    id: createBestieScratchNoteId(),
    sourceMessageId: input.sourceMessageId ?? null,
    title,
    updatedAt: nowSeconds,
  };
  let notes = [note, ...state.notes];
  if (notes.length > BESTIE_SCRATCH_MAX_NOTES) {
    notes = notes.slice(0, BESTIE_SCRATCH_MAX_NOTES);
  }
  return { ...state, notes };
}

export function updateBestieScratchNote(
  state: BestieScratchState,
  input: BestieScratchUpdateInput,
  nowSeconds = Math.floor(Date.now() / 1000),
): BestieScratchState {
  let changed = false;
  const notes = state.notes.map((note) => {
    if (note.id !== input.id) return note;
    changed = true;
    const body = input.body !== undefined ? input.body : note.body;
    const titleRaw =
      input.title !== undefined ? input.title.trim() : note.title;
    return {
      ...note,
      body,
      title: titleRaw || deriveBestieScratchTitle(body),
      updatedAt: nowSeconds,
    };
  });
  return changed ? { ...state, notes } : state;
}

export function removeBestieScratchNote(
  state: BestieScratchState,
  id: string,
): BestieScratchState {
  return { ...state, notes: state.notes.filter((note) => note.id !== id) };
}

export function markBestieScratchMessageProcessed(
  state: BestieScratchState,
  messageId: string,
): BestieScratchState {
  if (state.processedMessageIds.includes(messageId)) return state;
  const processedMessageIds = [...state.processedMessageIds, messageId];
  const trimmed =
    processedMessageIds.length > 200
      ? processedMessageIds.slice(processedMessageIds.length - 200)
      : processedMessageIds;
  return { ...state, processedMessageIds: trimmed };
}
