import { buildMessageLink } from "@/features/messages/lib/messageLink";
import type { TimelineMessage } from "@/features/messages/types";

export function buildBestieMessageLink(
  channelId: string | null | undefined,
  message: TimelineMessage | undefined,
): string | null {
  if (!channelId || !message) return null;

  const threadRootId = message.rootId ?? message.id;
  return buildMessageLink({
    channelId,
    messageId: threadRootId,
    threadRootId: message.rootId ? threadRootId : null,
  });
}

export function buildBestieMessageContext(
  channelId: string | null | undefined,
  message: TimelineMessage | undefined,
): string | null {
  const threadLink = buildBestieMessageLink(channelId, message);
  if (!threadLink || !message) return null;

  return `Help me with this thread from ${message.author}:\n\n${threadLink}`;
}

/** Prefix a Bestie ask with the originating message when that send opted in. */
export function composeBestieAskContent(
  outboundBody: string,
  contextEnvelope: string | null,
  options: { includeContext: boolean; contextAlreadySent: boolean },
): { content: string; attachedContext: boolean } {
  if (
    !contextEnvelope ||
    !options.includeContext ||
    options.contextAlreadySent
  ) {
    return { content: outboundBody, attachedContext: false };
  }
  return {
    content: `${contextEnvelope}\n\n${outboundBody}`,
    attachedContext: true,
  };
}

export type BestieAskReminderDelay = "15m" | "1h" | "24h";

const REMINDER_DELAY_LABEL: Record<BestieAskReminderDelay, string> = {
  "15m": "15 minutes",
  "1h": "1 hour",
  "24h": "24 hours",
};

const REMINDER_DELAY_SECONDS: Record<BestieAskReminderDelay, number> = {
  "15m": 15 * 60,
  "1h": 60 * 60,
  "24h": 24 * 60 * 60,
};

/** Unix seconds for a quick-action reminder, matching the client list store. */
export function bestieAskReminderDueAt(
  delay: BestieAskReminderDelay,
  nowMs = Date.now(),
): number {
  return Math.floor(nowMs / 1000) + REMINDER_DELAY_SECONDS[delay];
}

/**
 * Checked include-context path. This is not a local "remind me to…" sentence,
 * so the client does not create a placeholder. The agent must read the linked
 * message and distill it before fencing the reminder.
 */
export function withBestieSourceMessageLink(
  text: string,
  link: string | null | undefined,
): string {
  const trimmed = text.trim();
  if (!link) return trimmed;
  if (trimmed.includes(link)) return trimmed;
  if (!trimmed) return link;
  return `${trimmed}\n${link}`;
}

type BestieAskSourceScope = {
  agentPubkey: string;
  ownerPubkey: string;
  relayUrl: string;
};

const pendingSourceLink = new Map<string, { link: string; until: number }>();

function askSourceKey(scope: BestieAskSourceScope): string {
  return `${scope.ownerPubkey}|${scope.agentPubkey}|${scope.relayUrl}`;
}

/** Remember the message an Ask action came from, so a later agent add keeps it. */
export function rememberBestieAskSourceLink(
  scope: BestieAskSourceScope,
  link: string,
  nowMs = Date.now(),
): void {
  pendingSourceLink.set(askSourceKey(scope), {
    link,
    until: nowMs + 15 * 60 * 1000,
  });
}

/** Take the remembered link once an add actually lands. Expired entries drop. */
export function takeBestieAskSourceLink(
  scope: BestieAskSourceScope,
  nowMs = Date.now(),
): string | null {
  const key = askSourceKey(scope);
  const pending = pendingSourceLink.get(key);
  if (!pending) return null;
  pendingSourceLink.delete(key);
  if (pending.until < nowMs) return null;
  return pending.link;
}

export function composeBestieAskReminderPrompt(
  delay: BestieAskReminderDelay,
  messageLink?: string | null,
): string {
  const label = REMINDER_DELAY_LABEL[delay];
  const linkLine = messageLink
    ? ` The reminder text must end with this exact link on its own line:\n${messageLink}`
    : "";
  return (
    "Read the linked message and distill what I should follow up on before you create anything. " +
    `Then add one reminder due in ${label}, using that distillation as the reminder text.` +
    linkLine
  );
}

/**
 * Checked include-context path. Same as the reminder: distill first, then fence
 * one to-do. The client does not create a placeholder from this sentence.
 */
export function composeBestieAskTodoPrompt(messageLink?: string | null): string {
  const linkLine = messageLink
    ? ` The to-do text must end with this exact link on its own line:\n${messageLink}`
    : "";
  return (
    "Read the linked message and distill what I should follow up on before you create anything. " +
    "Then add one to-do whose text is that distillation." +
    linkLine
  );
}

/** Scratch note for an Ask Assistant message: full text, link last. */
export function composeBestieAskScratchNote(input: {
  author?: string | null;
  body?: string | null;
  messageLink?: string | null;
}): { body: string; title: string } {
  const title = input.author?.trim() || "Message";
  const message = input.body?.trim() ?? "";
  const link = input.messageLink?.trim() ?? "";
  const body =
    link && message && !message.includes(link)
      ? `${message}\n\n${link}`
      : message || link;
  return { body, title };
}

/** NL-shaped scratch-pad park. The body is the whole message plus its link. */
export function composeBestieAskScratchPrompt(input?: {
  author?: string | null;
  body?: string | null;
  messageLink?: string | null;
}): string {
  const note = composeBestieAskScratchNote(input ?? {});
  const body =
    note.body ||
    "Capture the included message context from this Ask Assistant session.";
  return `Park this: ${note.title}\n${body}`;
}
