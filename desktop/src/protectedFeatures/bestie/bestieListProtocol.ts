/**
 * Documented Bestie list protocol — teach the agent (and UI) how to mutate
 * reminders / to-dos via a fenced `bestie-list` JSON block.
 *
 * Desktop also applies a client-side natural-language path so “remind me…”
 * works even when the agent forgets the fence.
 */

export const BESTIE_LIST_FENCE_LANG = "bestie-list";

/** Marker used to append / strip turn hints from outbound Bestie messages. */
export const BESTIE_LIST_TURN_HINT_MARKER = "[Bestie lists]";

/**
 * Standing instructions for the Bestie agent. Keep stable — spawn/snapshot
 * injectors and outbound turn hints share this text.
 */
export const BESTIE_LIST_AGENT_INSTRUCTIONS = `You are the user's Bestie. When they ask you to add, complete, or remove a reminder or to-do, you MUST include a fenced ${BESTIE_LIST_FENCE_LANG} JSON block in your reply so the desktop list updates. Do not only describe the change in prose.

Fence format (one JSON object or an array of objects):

\`\`\`${BESTIE_LIST_FENCE_LANG}
{"op":"add","items":[{"kind":"reminder","text":"Call mom","dueAt":1735689600}]}
\`\`\`

Ops:
- add: items[] with kind "todo" | "reminder", text (required), dueAt unix seconds (optional; reminders only; prefer an absolute unix timestamp)
- complete: {"op":"complete","id":"<item-id>"}
- remove: {"op":"remove","id":"<item-id>"}

If the user did not give a due time for a reminder, omit dueAt (or set null). Confirm briefly in natural language in addition to the fence.

The desktop may already apply the user's natural-language add before your reply. Prefer acknowledging without a second add when the list already shows the item. If you still emit add, put the task text only (due time in dueAt, not in text); the client dedupes by core text + due window and prefers the row with dueAt.

For scheduled *jobs* (auto-run a prompt later), follow the Bestie job confirmation protocol (clarify → exact plan → user approve → fenced bestie-job add with confirmed:true). Do not treat jobs like instant reminders.`;

/** Compact turn hint appended to Bestie user messages that look like list intents. */
export function bestieListTurnHint(): string {
  return `

${BESTIE_LIST_TURN_HINT_MARKER}
When mutating reminders/todos, emit a fenced ${BESTIE_LIST_FENCE_LANG} JSON block, e.g.
\`\`\`${BESTIE_LIST_FENCE_LANG}
{"op":"add","items":[{"kind":"reminder","text":"…","dueAt":1735689600}]}
\`\`\`
(dueAt = unix seconds; omit if unknown). Also support complete/remove by id.`;
}

/** Strip the outbound turn hint (and anything after the marker) for UI display. */
export function stripBestieListTurnHint(content: string): string {
  const index = content.indexOf(`\n\n${BESTIE_LIST_TURN_HINT_MARKER}`);
  if (index >= 0) return content.slice(0, index).trimEnd();
  const alt = content.indexOf(BESTIE_LIST_TURN_HINT_MARKER);
  if (alt >= 0 && (alt === 0 || content[alt - 1] === "\n")) {
    return content.slice(0, alt).trimEnd();
  }
  return content;
}

/** Append the turn hint when the body looks like a list mutation request. */
export function withBestieListTurnHint(
  content: string,
  shouldAttach: boolean,
): string {
  if (!shouldAttach) return content;
  if (content.includes(BESTIE_LIST_TURN_HINT_MARKER)) return content;
  return `${content.trimEnd()}${bestieListTurnHint()}`;
}
