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
  const trackingId = bestieThreadId(thread.channelId, thread.rootEventId);
  return `${BESTIE_THREAD_SUMMARIZE_MARKER}

Summarize this thread Assistant is tracking in ${where}.
Tracking id: ${trackingId}
Root event: ${thread.rootEventId}
Channel id: ${thread.channelId}

Use \`buzz messages thread --channel ${thread.channelId} --event ${thread.rootEventId}\` if you need full history (channel membership or open visibility required on the relay).

Cover:
1. What the thread is about
2. Decisions already made
3. Open items still to work

Starter context${who}:
${thread.preview.trim() || "(no preview)"}`;
}

/** Parse composite thread id from a summarize prompt body. */
export function parseBestieThreadIdFromSummarizePrompt(
  content: string,
): string | null {
  const match = content.match(/^Tracking id:\s*(.+?)\s*$/m);
  const id = match?.[1]?.trim() ?? "";
  if (!id || !id.includes(":")) return null;
  return id;
}
