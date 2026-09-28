/**
 * Assistant popover — detect new messages the user is not currently looking at.
 */

export type BestiePopoverNewMessageTarget = {
  /** Message id to jump to / dismiss. */
  id: string;
  /** True when the message is outside the active session filter. */
  outsideSession: boolean;
  /** Truncated plain preview of the message body. */
  preview: string;
  /** Thread root id used to queue one banner per thread. */
  threadRootId: string;
};

const DEFAULT_PREVIEW_MAX = 140;

/** Collapse whitespace and truncate for the New message banner body. */
export function previewBestiePopoverMessageBody(
  body: string | null | undefined,
  max = DEFAULT_PREVIEW_MAX,
): string {
  const compact = (body ?? "").replace(/\s+/g, " ").trim();
  if (!compact) return "";
  if (compact.length <= max) return compact;
  return `${compact.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function threadRootIdFor(message: {
  id: string;
  parentId?: string | null;
  rootId?: string | null;
}): string {
  return message.rootId ?? message.parentId ?? message.id;
}

function toTarget(
  message: {
    id: string;
    body?: string | null;
    parentId?: string | null;
    rootId?: string | null;
  },
  outsideSession: boolean,
): BestiePopoverNewMessageTarget {
  return {
    id: message.id,
    outsideSession,
    preview: previewBestiePopoverMessageBody(message.body),
    threadRootId: threadRootIdFor(message),
  };
}

/**
 * Build the New message banner queue (newest first).
 *
 * - Outside-session messages: one entry per thread (newest message in that
 *   thread). View opens the Assistant DM on that thread; popover session stays.
 * - Otherwise, when scrolled away from the bottom: a single in-session entry
 *   (View scrolls within the popover transcript).
 * - `dismissedMessageIds` skips those message ids until a newer one arrives.
 */
export function resolveBestiePopoverNewMessageQueue(input: {
  /** Newest-first or any order; we pick by createdAt then id. */
  allMessages: readonly {
    id: string;
    createdAt: number;
    body?: string | null;
    parentId?: string | null;
    rootId?: string | null;
  }[];
  sessionMessageIds: ReadonlySet<string>;
  sessionRootId?: string | null;
  /** User is scrolled near the transcript bottom. */
  nearBottom: boolean;
  /** Ignore the user's own outbound id so sending doesn't flash the banner. */
  ignoreMessageId?: string | null;
  /** Message ids the user dismissed from the banner queue. */
  dismissedMessageIds?: ReadonlySet<string>;
}): BestiePopoverNewMessageTarget[] {
  const ignore = input.ignoreMessageId?.trim() || null;
  const dismissed = input.dismissedMessageIds ?? new Set<string>();
  const sorted = [...input.allMessages].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    return b.id.localeCompare(a.id);
  });

  const seenThreads = new Set<string>();
  const outsideQueue: BestiePopoverNewMessageTarget[] = [];
  for (const message of sorted) {
    if (ignore && message.id === ignore) continue;
    if (input.sessionMessageIds.has(message.id)) continue;
    const rootId = threadRootIdFor(message);
    // Newest message claims the thread slot first. If that newest id was
    // dismissed, skip the whole thread until a newer message arrives.
    if (seenThreads.has(rootId)) continue;
    seenThreads.add(rootId);
    if (dismissed.has(message.id)) continue;
    outsideQueue.push(toTarget(message, true));
  }
  if (outsideQueue.length > 0) return outsideQueue;

  if (input.nearBottom) return [];
  const newestInSession = sorted.find((message) => {
    if (ignore && message.id === ignore) return false;
    if (dismissed.has(message.id)) return false;
    return input.sessionMessageIds.has(message.id);
  });
  if (!newestInSession) return [];
  return [toTarget(newestInSession, false)];
}

/**
 * Pick the front of the New message queue (or null when empty).
 */
export function resolveBestiePopoverNewMessageTarget(input: {
  allMessages: readonly {
    id: string;
    createdAt: number;
    body?: string | null;
    parentId?: string | null;
    rootId?: string | null;
  }[];
  sessionMessageIds: ReadonlySet<string>;
  sessionRootId?: string | null;
  nearBottom: boolean;
  ignoreMessageId?: string | null;
  dismissedMessageIds?: ReadonlySet<string>;
}): BestiePopoverNewMessageTarget | null {
  return resolveBestiePopoverNewMessageQueue(input)[0] ?? null;
}
