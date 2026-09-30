import {
  HOME_MENTION_EVENT_KINDS,
  KIND_HUDDLE_STARTED,
  KIND_STREAM_MESSAGE_DIFF,
} from "@/shared/constants/kinds";

/**
 * Inbox thread context is the mention set plus the chat cards that render
 * their own row. System and job kinds stay out: the channel groups those,
 * and a raw inbox row would show them as noise.
 *
 * Do not fold these extras into `HOME_MENTION_EVENT_KINDS`. That list is the
 * unread and mention query and must stay aligned with buzz-db.
 */
export const INBOX_THREAD_CONTEXT_KINDS = [
  ...HOME_MENTION_EVENT_KINDS,
  KIND_STREAM_MESSAGE_DIFF,
  KIND_HUDDLE_STARTED,
] as const;

export const INBOX_THREAD_CONTEXT_LIMIT = 100;

export function inboxThreadDescendantFilter(
  channelId: string,
  threadRootId: string,
) {
  return {
    "#e": [threadRootId],
    "#h": [channelId],
    kinds: [...INBOX_THREAD_CONTEXT_KINDS],
    limit: INBOX_THREAD_CONTEXT_LIMIT,
  };
}
