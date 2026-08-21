import type { AppView } from "@/app/AppShell.helpers";

export type PlaygroundConversation = {
  channelId: string;
  draftKey: string;
};

/**
 * Screenshot is only offered when a channel or thread composer is underneath
 * the overlay. Pinned sites, Agents, Inbox-without-a-channel, and the other
 * primary views have no conversation to stage into.
 */
export function playgroundConversationFromRoute(input: {
  selectedView: AppView;
  selectedChannelId: string | null;
  threadId?: string | null;
}): PlaygroundConversation | null {
  if (input.selectedView !== "channel") {
    return null;
  }
  const channelId = input.selectedChannelId?.trim() ?? "";
  if (!channelId) {
    return null;
  }
  const threadId = input.threadId?.trim() ?? "";
  return {
    channelId,
    draftKey: threadId ? `thread:${threadId}` : channelId,
  };
}

export function playgroundScreenshotAvailable(
  conversation: PlaygroundConversation | null,
): boolean {
  return conversation != null;
}

/** True when the overlay sits on a channel with a split thread pane open. */
export function playgroundConversationHasOpenThread(
  conversation: PlaygroundConversation | null,
): boolean {
  return Boolean(conversation?.draftKey.startsWith("thread:"));
}
