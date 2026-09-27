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

/**
 * Keep messages that belong to the active Bestie session.
 * Includes threaded agent replies whose parent is in-session.
 */
export function filterBestieSessionMessages(
  messages: readonly TimelineMessage[],
  boundary: {
    baselineMessageIds: ReadonlySet<string>;
    firstMessageCreatedAt: number;
  } | null,
): TimelineMessage[] {
  if (!boundary) return [];

  const inSessionIds = new Set<string>();
  const ordered = [...messages].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }
    return left.id.localeCompare(right.id);
  });

  for (const message of ordered) {
    if (boundary.baselineMessageIds.has(message.id)) continue;
    const parentInSession =
      message.parentId != null && inSessionIds.has(message.parentId);
    const afterBoundary = message.createdAt >= boundary.firstMessageCreatedAt;
    if (afterBoundary || parentInSession) {
      inSessionIds.add(message.id);
    }
  }

  return ordered.filter((message) => inSessionIds.has(message.id));
}
