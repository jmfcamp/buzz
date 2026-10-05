import type { TimelineMessage } from "@/features/messages/types";

/**
 * Flatten Bestie popover messages into a chronological top-level list.
 * Parent/reply links become regular rows so agent replies are not buried
 * under "N replies" thread stubs.
 */
export function flattenBestieTranscriptMessages(
  messages: readonly TimelineMessage[],
): TimelineMessage[] {
  return [...messages]
    .sort((left, right) => {
      if (left.createdAt !== right.createdAt) {
        return left.createdAt - right.createdAt;
      }
      return left.id.localeCompare(right.id);
    })
    .map((message) => {
      if (
        message.parentId == null &&
        message.rootId == null &&
        message.depth === 0
      ) {
        return message;
      }
      return {
        ...message,
        depth: 0,
        parentId: null,
        rootId: null,
      };
    });
}

export type BestieSessionFilterBoundary = {
  baselineMessageIds: ReadonlySet<string>;
  firstMessageCreatedAt: number;
  sessionRootId?: string;
};

type BestieThreadMember = {
  id: string;
  parentId?: string | null;
  rootId?: string | null;
};

/**
 * Thread root for a timeline row.
 * Uses the stored root, then walks parents, then the row's own id.
 */
export function messageBestieThreadRootId(
  message: BestieThreadMember,
  byId?: ReadonlyMap<string, BestieThreadMember>,
): string {
  if (message.rootId) return message.rootId;
  if (!message.parentId) return message.id;
  if (!byId) return message.parentId;
  const seen = new Set<string>([message.id]);
  let current = message;
  while (current.parentId && !seen.has(current.parentId)) {
    const parent = byId.get(current.parentId);
    if (!parent) return current.parentId;
    if (parent.rootId) return parent.rootId;
    if (!parent.parentId) return parent.id;
    seen.add(current.parentId);
    current = parent;
  }
  return message.parentId;
}

function sortByCreatedAtThenId<T extends { createdAt: number; id: string }>(
  messages: readonly T[],
): T[] {
  return [...messages].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }
    return left.id.localeCompare(right.id);
  });
}

/**
 * Keep messages that belong to the active Bestie session.
 * Includes threaded agent replies whose parent is in-session.
 * `excludeRootIds` hides Ask-from-message threads from the bottom panel.
 */
export function filterBestieSessionMessages(
  messages: readonly TimelineMessage[],
  boundary: BestieSessionFilterBoundary | null,
  options?: { excludeRootIds?: ReadonlySet<string> },
): TimelineMessage[] {
  if (!boundary) return [];

  const excludeRootIds = options?.excludeRootIds;
  const byId = new Map(messages.map((message) => [message.id, message]));
  const inSessionIds = new Set<string>();
  const ordered = sortByCreatedAtThenId(messages);

  for (const message of ordered) {
    if (boundary.baselineMessageIds.has(message.id)) continue;
    const threadRootId = messageBestieThreadRootId(message, byId);
    if (
      excludeRootIds &&
      excludeRootIds.size > 0 &&
      threadRootId !== boundary.sessionRootId &&
      excludeRootIds.has(threadRootId)
    ) {
      continue;
    }
    const parentInSession =
      message.parentId != null && inSessionIds.has(message.parentId);
    const afterBoundary = message.createdAt >= boundary.firstMessageCreatedAt;
    if (afterBoundary || parentInSession) {
      inSessionIds.add(message.id);
    }
  }

  return ordered.filter((message) => inSessionIds.has(message.id));
}

/**
 * Messages in one Ask-from-message thread.
 * The root and every reply under it stay. Other assistant threads stay out.
 */
export function filterMessagesInBestieThread<
  T extends BestieThreadMember & { createdAt: number },
>(messages: readonly T[], sessionRootId: string): T[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  return sortByCreatedAtThenId(messages).filter(
    (message) => messageBestieThreadRootId(message, byId) === sessionRootId,
  );
}

/**
 * Continue an active Bestie session by replying in-thread to the session root.
 * First message of a session (no boundary) posts as a new channel root.
 */
export function resolveBestieSendParentEventId(
  boundary: { sessionRootId: string } | null | undefined,
): string | null {
  if (!boundary?.sessionRootId) return null;
  return boundary.sessionRootId;
}

/**
 * Where the next Assistant send belongs.
 * A message ask never continues the bottom panel's thread.
 */
export function resolveBestieComposerThread(input: {
  isMessageAsk: boolean;
  messageThreadRootId?: string | null;
  footerSessionRootId?: string | null;
}): {
  parentEventId: string | null;
  create: "message" | "footer" | "none";
} {
  if (input.isMessageAsk) {
    const rootId = input.messageThreadRootId ?? null;
    if (rootId) return { parentEventId: rootId, create: "none" };
    return { parentEventId: null, create: "message" };
  }
  const footerRootId = input.footerSessionRootId ?? null;
  if (footerRootId) return { parentEventId: footerRootId, create: "none" };
  return { parentEventId: null, create: "footer" };
}

/**
 * Thread roots whose reply subtrees belong in the active Bestie transcript.
 * Always includes the persisted session root; also includes legacy in-session
 * top-level messages from before single-thread send was fixed.
 */
export function collectBestieSessionThreadRootIds(
  boundary: BestieSessionFilterBoundary | null,
  channelMessages: readonly {
    id: string;
    parentId?: string | null;
    createdAt: number;
  }[],
  excludeRootIds?: ReadonlySet<string>,
): string[] {
  if (!boundary) return [];
  const ids = new Set<string>();
  if (boundary.sessionRootId) ids.add(boundary.sessionRootId);
  for (const message of channelMessages) {
    if (message.parentId != null) continue;
    if (boundary.baselineMessageIds.has(message.id)) continue;
    if (message.createdAt < boundary.firstMessageCreatedAt) continue;
    if (
      excludeRootIds?.has(message.id) &&
      message.id !== boundary.sessionRootId
    ) {
      continue;
    }
    ids.add(message.id);
  }
  return [...ids];
}
