// "Ask Assistant about this message" on web: the message action hands a context draft to the Assistant popup.
import { buildMessageLink } from "@/features/messages/lib/messageLink";
import type { TimelineMessage } from "@/features/messages/types";

export const ASK_EVENT = "buzz-web-assistant-ask";
let pending: string | null = null;

/** Same context text as the desktop "Ask Assistant" action: who it is from plus a link to the thread. */
export function buildAskContext(
  channelId: string | null | undefined,
  message: TimelineMessage,
): string | null {
  if (!channelId) return null;
  const root = message.rootId ?? message.id;
  const link = buildMessageLink({
    channelId,
    messageId: root,
    threadRootId: message.rootId ? root : null,
  });
  return link
    ? `Help me with this thread from ${message.author ?? "someone"}:\n\n${link}`
    : null;
}

export function queueAsk(text: string): void {
  pending = text;
  window.dispatchEvent(new Event(ASK_EVENT));
}

/** Take (and clear) the queued ask, if any. */
export function takeAsk(): string | null {
  const t = pending;
  pending = null;
  return t;
}
