/**
 * Bestie Jobs protocol — agent fence + turn hints for scheduled prompts.
 */

export const BESTIE_JOB_FENCE_LANG = "bestie-job";

export const BESTIE_JOB_TURN_HINT_MARKER = "[Bestie jobs]";

export const BESTIE_JOB_AGENT_INSTRUCTIONS = `When the user asks you to schedule a recurring or one-time *job* (auto-run a prompt later — not a simple reminder nudge), include a fenced ${BESTIE_JOB_FENCE_LANG} JSON block.

\`\`\`${BESTIE_JOB_FENCE_LANG}
{"op":"add","job":{"title":"Morning brief","prompt":"Summarize my calendar and inbox.","schedule":{"kind":"daily","hour":9,"minute":0}}}
\`\`\`

Schedule kinds:
- once: {"kind":"once","dueAt":<unix seconds>}
- interval: {"kind":"interval","everySeconds":3600}
- daily: {"kind":"daily","hour":9,"minute":0}
- weekly: {"kind":"weekly","weekday":1,"hour":9,"minute":0} (0=Sunday)

Also support {"op":"update","id":"…","enabled":false} and {"op":"remove","id":"…"}.
Jobs are different from reminders: when due, the desktop wakes you and sends the job prompt as a user turn for you to execute.`;

export function bestieJobTurnHint(): string {
  return `

${BESTIE_JOB_TURN_HINT_MARKER}
When scheduling jobs (auto-run prompts), emit a fenced ${BESTIE_JOB_FENCE_LANG} JSON block. See standing Bestie job instructions.`;
}

export function stripBestieJobTurnHint(content: string): string {
  const index = content.indexOf(`\n\n${BESTIE_JOB_TURN_HINT_MARKER}`);
  if (index >= 0) return content.slice(0, index).trimEnd();
  const alt = content.indexOf(BESTIE_JOB_TURN_HINT_MARKER);
  if (alt >= 0 && (alt === 0 || content[alt - 1] === "\n")) {
    return content.slice(0, alt).trimEnd();
  }
  return content;
}

export function withBestieJobTurnHint(
  content: string,
  shouldAttach: boolean,
): string {
  if (!shouldAttach) return content;
  if (content.includes(BESTIE_JOB_TURN_HINT_MARKER)) return content;
  return `${content.trimEnd()}${bestieJobTurnHint()}`;
}
