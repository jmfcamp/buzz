/** Markers + prompts for Bestie thread summarize turns (top-level DM). */

export const BESTIE_THREAD_SUMMARIZE_MARKER = "[Bestie thread summarize]";
export const BESTIE_THREAD_SUMMARIZE_EVENT = "buzz:bestie-thread-summarize";

export function bestieThreadId(channelId: string, rootEventId: string): string {
  return `${channelId}:${rootEventId}`;
}

export function formatBestieThreadSummarizePrompt(thread: {
  channelId: string;
  channelName: string | null;
  preview: string;
  rootEventId: string;
  authorName?: string | null;
}): string {
  const where =
    thread.channelName?.trim() ||
    `channel ${thread.channelId.slice(0, 8)}…`;
  const who = thread.authorName?.trim() ? ` (from ${thread.authorName})` : "";
  return `${BESTIE_THREAD_SUMMARIZE_MARKER}

Summarize this thread Bestie is tracking in ${where}.
Root event: ${thread.rootEventId}
Channel id: ${thread.channelId}

Cover:
1. What the thread is about
2. Decisions already made
3. Open items still to work

Starter context${who}:
${thread.preview.trim() || "(no preview)"}`;
}
