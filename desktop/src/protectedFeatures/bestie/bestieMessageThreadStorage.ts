import {
  BESTIE_SESSION_STORAGE_PREFIX,
  bestieSessionStorageKey,
  type BestieSessionScope,
} from "./bestieSessionStorage";

/** One local map of message-ask threads for an assistant. */
export const BESTIE_MESSAGE_THREAD_STORAGE_PREFIX =
  "buzz-bestie-message-thread.v1";

/** Same-window notice so the bottom Assistant panel can hide these threads. */
export const BESTIE_MESSAGE_THREAD_EVENT = "buzz:bestie-message-thread";

export type BestieMessageThreadScope = BestieSessionScope & {
  channelId: string;
  messageId: string;
};

/** Reply root for Ask Assistant opened on one channel message. */
export type BestieMessageThread = {
  firstMessageCreatedAt: number;
  sessionRootId: string;
};

type StoredIndex = {
  threads: Record<string, BestieMessageThread>;
};

/**
 * Storage key for every message ask owned by one assistant.
 * The relay, owner, and agent match the bottom Assistant session key.
 */
export function bestieMessageThreadStorageKey(
  scope: BestieSessionScope,
): string {
  const sessionKey = bestieSessionStorageKey(scope);
  const suffix = sessionKey.slice(BESTIE_SESSION_STORAGE_PREFIX.length);
  return `${BESTIE_MESSAGE_THREAD_STORAGE_PREFIX}${suffix}`;
}

function threadMapKey(channelId: string, messageId: string): string {
  return `${channelId.trim().toLowerCase()}:${messageId.trim().toLowerCase()}`;
}

function isThread(value: unknown): value is BestieMessageThread {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.sessionRootId === "string" &&
    record.sessionRootId.length > 0 &&
    typeof record.firstMessageCreatedAt === "number" &&
    Number.isFinite(record.firstMessageCreatedAt) &&
    record.firstMessageCreatedAt >= 0
  );
}

function readIndex(scope: BestieSessionScope): StoredIndex {
  try {
    const raw = window.localStorage.getItem(
      bestieMessageThreadStorageKey(scope),
    );
    if (!raw) return { threads: {} };
    const parsed = JSON.parse(raw) as { threads?: unknown };
    if (typeof parsed !== "object" || parsed === null) return { threads: {} };
    const threads: Record<string, BestieMessageThread> = {};
    if (typeof parsed.threads !== "object" || parsed.threads === null) {
      return { threads };
    }
    for (const [key, value] of Object.entries(parsed.threads)) {
      if (isThread(value)) threads[key] = value;
    }
    return { threads };
  } catch {
    return { threads: {} };
  }
}

function writeIndex(scope: BestieSessionScope, index: StoredIndex): void {
  const key = bestieMessageThreadStorageKey(scope);
  try {
    if (Object.keys(index.threads).length === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(index));
    }
    window.dispatchEvent(new Event(BESTIE_MESSAGE_THREAD_EVENT));
  } catch {
    // Ignore quota / private-mode failures; the open panel still has memory.
  }
}

/** Thread saved for this source message, or null when Ask has not been sent. */
export function readBestieMessageThread(
  scope: BestieMessageThreadScope,
): BestieMessageThread | null {
  const index = readIndex(scope);
  return index.threads[threadMapKey(scope.channelId, scope.messageId)] ?? null;
}

/** Remember the assistant reply root for one source message. */
export function writeBestieMessageThread(
  scope: BestieMessageThreadScope,
  thread: BestieMessageThread,
): void {
  const index = readIndex(scope);
  index.threads[threadMapKey(scope.channelId, scope.messageId)] = {
    firstMessageCreatedAt: thread.firstMessageCreatedAt,
    sessionRootId: thread.sessionRootId,
  };
  writeIndex(scope, index);
}

/** Drop the assistant thread for one source message. */
export function clearBestieMessageThread(
  scope: BestieMessageThreadScope,
): void {
  const index = readIndex(scope);
  delete index.threads[threadMapKey(scope.channelId, scope.messageId)];
  writeIndex(scope, index);
}

/**
 * Reply roots started from Ask Assistant on a message.
 * The bottom Assistant transcript omits these roots.
 */
export function listBestieMessageThreadRootIds(
  scope: BestieSessionScope,
): string[] {
  return [
    ...new Set(
      Object.values(readIndex(scope).threads).map(
        (thread) => thread.sessionRootId,
      ),
    ),
  ];
}

/** Re-read message threads when another panel saves or clears one. */
export function subscribeBestieMessageThreads(
  listener: () => void,
): () => void {
  window.addEventListener(BESTIE_MESSAGE_THREAD_EVENT, listener);
  return () =>
    window.removeEventListener(BESTIE_MESSAGE_THREAD_EVENT, listener);
}
