import { parseChannelLink } from "@/features/messages/lib/channelLink";
import { parseMessageLink } from "@/features/messages/lib/messageLink";

export type GrantConversationBinding = {
  channelId: string;
  threadRoot: string | null;
};

/**
 * Parse a pasted Buzz channel/thread link (or in-app /channels path) into
 * grant binding ids. Reuses message + channel deep-link parsers.
 */
export function parseGrantConversationLink(
  raw: string,
): GrantConversationBinding | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const message = parseMessageLink(trimmed);
  if (message.ok) {
    return {
      channelId: message.value.channelId,
      // Message deep links bind channel; threadRoot only when `thread=` is set
      // (do not treat message `id=` as a thread root).
      threadRoot: message.value.threadRootId,
    };
  }

  const channel = parseChannelLink(trimmed);
  if (channel.ok) {
    return {
      channelId: channel.value.channelId,
      threadRoot: channel.value.messageId ?? null,
    };
  }

  return parseChannelsPathLink(trimmed);
}

function parseChannelsPathLink(raw: string): GrantConversationBinding | null {
  let url: URL;
  try {
    url = new URL(raw, "https://buzz.local");
  } catch {
    return null;
  }

  const posts = url.pathname.match(
    /^\/channels\/([^/]+)\/posts\/([^/]+)\/?$/i,
  );
  if (posts) {
    return {
      channelId: decodeURIComponent(posts[1]),
      threadRoot: decodeURIComponent(posts[2]),
    };
  }

  const channelOnly = url.pathname.match(/^\/channels\/([^/]+)\/?$/i);
  if (!channelOnly) return null;

  const channelId = decodeURIComponent(channelOnly[1]);
  const threadRoot =
    url.searchParams.get("threadRootId") ??
    url.searchParams.get("thread") ??
    null;
  return {
    channelId,
    threadRoot: threadRoot?.trim() || null,
  };
}
