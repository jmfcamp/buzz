import { getThreadReference } from "@/features/messages/lib/threading";
import type { FeedItem } from "@/shared/api/types";

type FeedReply = Pick<
  FeedItem,
  "id" | "pubkey" | "createdAt" | "channelId" | "tags"
>;

/**
 * Web fallback for the timeline thread-summary "(N new)" badge.
 *
 * The channel window (NIP-CW) returns top-level rows plus relay thread
 * summaries, not the reply events. Desktop fills `repliesByRootId` from its
 * persisted channel-head cache and the live subscription, but a fresh PWA load
 * has no reply events for replies that landed while it was closed, so the
 * per-reply count in computeThreadBadgeCounts sees an empty subtree and the
 * summary row shows no badge — even though the same replies light the channel
 * unread dot (from the unread thread feed items).
 *
 * This counts those unread thread-reply feed items per root for the active
 * channel and only raises a root's count (never lowers what local replies
 * computed). Feed items are already filtered to unread against
 * max(msg:<id>, channel) markers upstream.
 */
export function mergeFeedThreadBadgeCounts(
  localCounts: ReadonlyMap<string, number>,
  feedReplies: ReadonlyArray<FeedReply>,
  options: {
    channelId: string | null;
    topLevelIds: ReadonlySet<string>;
    isNotified: (rootId: string) => boolean;
    currentPubkey?: string;
  },
): Map<string, number> {
  const merged = new Map(localCounts);
  if (!options.channelId || feedReplies.length === 0) return merged;
  const self = options.currentPubkey?.toLowerCase();
  const seen = new Set<string>();
  const byRoot = new Map<string, number>();
  for (const item of feedReplies) {
    if (item.channelId !== options.channelId) continue;
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (self && item.pubkey?.toLowerCase() === self) continue;
    const { rootId } = getThreadReference(item.tags);
    if (!rootId || !options.topLevelIds.has(rootId)) continue;
    if (!options.isNotified(rootId)) continue;
    byRoot.set(rootId, (byRoot.get(rootId) ?? 0) + 1);
  }
  for (const [rootId, count] of byRoot) {
    if (count > (merged.get(rootId) ?? 0)) merged.set(rootId, count);
  }
  return merged;
}
