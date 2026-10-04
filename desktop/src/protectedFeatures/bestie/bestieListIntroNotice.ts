/**
 * Footer Assistant attention: list-only introductions vs a real chat message.
 *
 * The bottom agent ring lights for new agent DM rows. A row that only adds
 * reminders, to-dos, threads, scratch notes, or jobs (no chat prose) is not a
 * message the New-message banner should claim. Callers show "Added …" instead.
 */

import { stripBestieOutboundHints } from "./bestieOutboundHints";
import { parseBestieJobActionsFromMessage } from "./parseBestieJobActions";
import { parseBestieListActionsFromMessage } from "./parseBestieListActions";
import { parseBestieScratchActionsFromMessage } from "./parseBestieScratchActions";

export const BESTIE_INTRO_KINDS = [
  "reminder",
  "todo",
  "thread",
  "scratch",
  "job",
] as const;

export type BestieIntroKind = (typeof BESTIE_INTRO_KINDS)[number];

export type BestieIntroCounts = Record<BestieIntroKind, number>;

const FENCE_RE = /```bestie-(?:list|scratch|job|thread)\s*\r?\n[\s\S]*?```/gi;

const THREAD_FENCE_RE = /```bestie-thread\s*\r?\n([\s\S]*?)```/gi;

const PHRASE: Record<BestieIntroKind, { plural: string; singular: string }> = {
  reminder: { plural: "reminders", singular: "a reminder" },
  todo: { plural: "to-dos", singular: "a to-do" },
  thread: { plural: "threads", singular: "a thread" },
  scratch: { plural: "scratch notes", singular: "a scratch note" },
  job: { plural: "jobs", singular: "a job" },
};

export function emptyBestieIntroCounts(): BestieIntroCounts {
  return { job: 0, reminder: 0, scratch: 0, thread: 0, todo: 0 };
}

export function bestieIntroCountsTotal(counts: BestieIntroCounts): number {
  let total = 0;
  for (const kind of BESTIE_INTRO_KINDS) total += counts[kind];
  return total;
}

/** Plain-language banner. Kinds only — never ids. Null when nothing was added. */
export function formatBestieListIntroBanner(
  counts: BestieIntroCounts,
): string | null {
  const parts: string[] = [];
  for (const kind of BESTIE_INTRO_KINDS) {
    const count = counts[kind];
    if (count <= 0) continue;
    const phrase = PHRASE[kind];
    parts.push(count === 1 ? phrase.singular : `${count} ${phrase.plural}`);
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return `Added ${parts[0]}`;
  if (parts.length === 2) return `Added ${parts[0]} and ${parts[1]}`;
  return `Added ${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function stripStructuredFences(content: string): string {
  return content.replace(FENCE_RE, "");
}

/** Chat prose left after hints and bestie list/scratch/job/thread fences. */
export function bestieVisibleChatProse(
  content: string | null | undefined,
): string {
  if (typeof content !== "string" || content.length === 0) return "";
  const stripped = stripStructuredFences(stripBestieOutboundHints(content))
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return "";
  if (
    (stripped.startsWith("{") || stripped.startsWith("[")) &&
    stripped.includes('"op"')
  ) {
    try {
      JSON.parse(stripped);
      return "";
    } catch {
      return stripped;
    }
  }
  return stripped;
}

function countThreadAdds(content: string): number {
  let count = 0;
  for (const match of content.matchAll(THREAD_FENCE_RE)) {
    const block = (match[1] ?? "").trim();
    if (!block) continue;
    try {
      const parsed: unknown = JSON.parse(block);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of list) {
        if (typeof entry !== "object" || entry === null) continue;
        if ((entry as Record<string, unknown>).op === "add") count += 1;
      }
    } catch {
      // Ignore malformed fences.
    }
  }
  return count;
}

function countBareThreadJson(content: string): number {
  const trimmed = stripStructuredFences(
    stripBestieOutboundHints(content),
  ).trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return 0;
  if (!trimmed.includes('"op"')) return 0;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    let count = 0;
    for (const entry of list) {
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as Record<string, unknown>;
      if (record.op !== "add") continue;
      const looksLikeThread =
        typeof record.rootEventId === "string" ||
        typeof record.channelId === "string";
      if (looksLikeThread) count += 1;
    }
    return count;
  } catch {
    return 0;
  }
}

/** Adds embedded in one agent row. Completes, removes, and drafts do not count. */
export function countBestieIntroductions(
  content: string | null | undefined,
): BestieIntroCounts {
  const counts = emptyBestieIntroCounts();
  if (typeof content !== "string" || content.length === 0) return counts;

  for (const action of parseBestieListActionsFromMessage(content)) {
    if (action.op !== "add") continue;
    for (const item of action.items) {
      if (item.kind === "reminder") counts.reminder += 1;
      else if (item.kind === "todo") counts.todo += 1;
    }
  }
  for (const action of parseBestieScratchActionsFromMessage(content)) {
    if (action.op === "add") counts.scratch += 1;
  }
  for (const action of parseBestieJobActionsFromMessage(content)) {
    if (action.op === "add") counts.job += 1;
  }

  const structuredAdds =
    counts.reminder + counts.todo + counts.scratch + counts.job;
  counts.thread += countThreadAdds(content);
  if (structuredAdds === 0 && counts.thread === 0) {
    counts.thread += countBareThreadJson(content);
  }
  return counts;
}

export type BestieAttentionClass =
  | { kind: "list-only"; counts: BestieIntroCounts }
  | { kind: "none" }
  | { kind: "real-message" };

/**
 * One agent row.
 * - Visible chat prose → real message (even if it also adds list rows).
 * - No prose, but list/thread/scratch/job adds → list-only.
 * - Otherwise none (does not by itself explain the footer light).
 */
export function classifyBestieAttentionMessage(
  content: string | null | undefined,
): BestieAttentionClass {
  const counts = countBestieIntroductions(content);
  if (bestieVisibleChatProse(content).length > 0) {
    return { kind: "real-message" };
  }
  if (bestieIntroCountsTotal(counts) > 0) {
    return { counts, kind: "list-only" };
  }
  return { kind: "none" };
}

/**
 * Batch of agent rows that lit (or would light) the footer button.
 * Any real chat message wins — the list banner must not replace it.
 */
export function classifyBestieAttentionMessages(
  contents: readonly (string | null | undefined)[],
):
  | { banner: string; counts: BestieIntroCounts; kind: "list-only" }
  | { kind: "none" }
  | { kind: "real-message" } {
  const counts = emptyBestieIntroCounts();
  let listOnly = false;
  for (const content of contents) {
    const verdict = classifyBestieAttentionMessage(content);
    if (verdict.kind === "real-message") return { kind: "real-message" };
    if (verdict.kind !== "list-only") continue;
    listOnly = true;
    for (const kind of BESTIE_INTRO_KINDS) {
      counts[kind] += verdict.counts[kind];
    }
  }
  if (!listOnly) return { kind: "none" };
  const banner = formatBestieListIntroBanner(counts);
  if (!banner) return { kind: "none" };
  return { banner, counts, kind: "list-only" };
}

/** True when this body must not drive the New message banner. */
export function isBestieListOnlyAttentionMessage(
  content: string | null | undefined,
): boolean {
  return classifyBestieAttentionMessage(content).kind === "list-only";
}
