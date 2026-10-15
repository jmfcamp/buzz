// "All messages" channels: new top-level posts land in the Inbox tab under
// the Channels filter. Marked with a client-only tag so tab/filter logic can
// recognise them without a relay change.
import type { Channel, FeedItem, RelayEvent } from "@/shared/api/types";
import {
  getChannelIdFromTags,
  isThreadReply,
} from "@/features/messages/lib/threading";
import { NOTIFY_MESSAGE_KINDS } from "./notificationInbox";

export const CHANNEL_SUBSCRIPTION_TAG = "buzz-inbox-source";
export const CHANNEL_SUBSCRIPTION_VALUE = "channel";

export function isChannelSubscriptionFeedItem(
  item: Pick<FeedItem, "tags"> | undefined,
): boolean {
  return Boolean(
    item?.tags?.some(
      (t) =>
        t[0] === CHANNEL_SUBSCRIPTION_TAG && t[1] === CHANNEL_SUBSCRIPTION_VALUE,
    ),
  );
}

export function buildChannelSubscriptionItems(
  events: readonly RelayEvent[],
  o: {
    me: string;
    channels: readonly Channel[];
    allChannelIds: ReadonlySet<string>;
    mutedChannelIds: ReadonlySet<string>;
  },
): FeedItem[] {
  const me = o.me.toLowerCase();
  const byId = new Map(o.channels.map((c) => [c.id, c]));
  const out = new Map<string, FeedItem>();
  for (const ev of events) {
    if (!NOTIFY_MESSAGE_KINDS.includes(ev.kind)) continue;
    if (ev.pubkey.toLowerCase() === me) continue;
    if (isThreadReply(ev.tags)) continue; // threads come via follows
    // A direct @you is already a Mention row.
    if (ev.tags.some((t) => t[0] === "p" && t[1]?.toLowerCase() === me))
      continue;
    const channelId = getChannelIdFromTags(ev.tags);
    if (!channelId || !o.allChannelIds.has(channelId)) continue;
    if (o.mutedChannelIds.has(channelId)) continue;
    const channel = byId.get(channelId);
    if (!channel || channel.channelType === "dm") continue;
    out.set(ev.id, {
      id: ev.id,
      kind: ev.kind,
      pubkey: ev.pubkey,
      content: ev.content,
      createdAt: ev.created_at,
      channelId,
      channelName: channel.name ?? "",
      channelType: channel.channelType,
      tags: [...ev.tags, [CHANNEL_SUBSCRIPTION_TAG, CHANNEL_SUBSCRIPTION_VALUE]],
      category: "activity",
    });
  }
  return [...out.values()].sort((a, b) => b.createdAt - a.createdAt);
}
