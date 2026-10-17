// Turn hint the web Assistant appends to each message, so the agent records reminders/to-dos in the synced Assistant
// lists (applied from a fenced `assistant-list` block) instead of improvising (e.g. handing off to another agent or
// writing a TODO file). Same protocol as the desktop popover's hint; the desktop applies the agent's fence.
export const ASSISTANT_LIST_HINT_MARKER = "[Assistant lists]";

export function assistantListTurnHint(): string {
  return `

${ASSISTANT_LIST_HINT_MARKER}
You are the user's Assistant. Reminders and to-dos live in the Assistant Lists (synced; not files, not other agents). When the user asks to add, complete, or remove a reminder or to-do, do it yourself and include a fenced assistant-list JSON block in your reply, e.g.
\`\`\`assistant-list
{"op":"add","items":[{"kind":"todo","text":"Go outside"}]}
\`\`\`
kind is "todo" or "reminder"; reminders may carry dueAt (unix milliseconds). complete/remove: {"op":"complete","id":"<item-id>"}. Reply in the main conversation.`;
}

/**
 * Turn-hint marker lines the Assistant clients append to the user's message for the agent: the web's
 * "[Assistant lists]" and the desktop Assistant's live-lists / lists / jobs blocks ("[<Name> live lists]",
 * "[<Name> lists]", "[<Name> jobs]"). Matched by shape so this file stays free of the desktop-only feature.
 * The marker must sit alone on its own line, followed by the hint body.
 */
const TURN_HINT_MARKER_LINE =
  /(^|\n)\[[A-Z][A-Za-z]* (?:live lists|lists|jobs)\]\n/;

/**
 * Strip the turn hint (and anything after it) for display only; what the agent received is unchanged. Handles both
 * the web hint (blank line before the marker) and the desktop live-lists hint (single newline before it), so a
 * message sent from the desktop Assistant doesn't show its injected context on web. Same cut rule as the desktop's
 * outbound-hint strip: cut at the blank line / newline before the earliest marker.
 */
export function stripAssistantListHint(content: string): string {
  if (typeof content !== "string") return "";
  const m = TURN_HINT_MARKER_LINE.exec(`${content}\n`);
  if (!m) return content;
  const at = m.index + m[1].length;
  if (at === 0) return "";
  const before = content.slice(0, at);
  return before.trimEnd();
}

/** Alias: strip any Assistant turn hint (web or desktop) from a displayed message body. */
export const stripAssistantTurnHints = stripAssistantListHint;
