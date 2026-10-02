import { getThreadReference } from "@/features/messages/lib/threading";

/**
 * A starred thread fills the main area by itself.
 * Activity, profile, and channel management keep their own split.
 * Forum posts and huddle transcripts keep their own layout.
 */
export function shouldShowStarredThreadAlone(input: {
  channelType?: string | null;
  hasNonThreadAuxiliary: boolean;
  isHuddleTranscript?: boolean;
  openThreadRootId: string | null;
  starredRootIds: ReadonlySet<string>;
}): boolean {
  if (input.channelType === "forum" || input.isHuddleTranscript) return false;
  if (input.hasNonThreadAuxiliary) return false;
  const rootId = input.openThreadRootId?.trim();
  if (!rootId) return false;
  return input.starredRootIds.has(rootId);
}

/**
 * When the open thread is in Starred threads, the starred row owns the active
 * highlight — the parent channel row below must not also look selected.
 */
export function shouldSuppressChannelActiveForStarredThread(input: {
  isChannelActive: boolean;
  selectedThreadRootId: string | null;
  isThreadStarred: (rootId: string) => boolean;
}): boolean {
  if (!input.isChannelActive) return false;
  const rootId = input.selectedThreadRootId?.trim();
  if (!rootId) return false;
  return input.isThreadStarred(rootId);
}

export function formatSidebarUnreadCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

/**
 * Conversation id for a thread-feed item, matching inbox derivation for
 * ordinary channel messages (root → parent → event id). Avoids importing the
 * heavy home/inbox module into channel-row code paths.
 */
export function threadFeedConversationId(item: {
  id: string;
  tags: string[][];
}): string {
  const thread = getThreadReference(item.tags);
  return thread.rootId ?? thread.parentId ?? item.id;
}

/** Count unread thread-feed items that belong to a starred thread root. */
export function countUnreadForStarredThreadRoot(
  unreadThreadFeedItems: readonly { id: string; tags: string[][] }[],
  rootId: string,
): number {
  const trimmed = rootId.trim();
  if (!trimmed) return 0;
  let count = 0;
  for (const item of unreadThreadFeedItems) {
    if (threadFeedConversationId(item) === trimmed) count += 1;
  }
  return count;
}
