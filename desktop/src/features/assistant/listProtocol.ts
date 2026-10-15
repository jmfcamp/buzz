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

/** Strip the hint (and anything after it) for display. */
export function stripAssistantListHint(content: string): string {
  const i = content.indexOf(`\n\n${ASSISTANT_LIST_HINT_MARKER}`);
  if (i >= 0) return content.slice(0, i).trimEnd();
  const j = content.indexOf(ASSISTANT_LIST_HINT_MARKER);
  return j === 0 ? "" : content;
}
