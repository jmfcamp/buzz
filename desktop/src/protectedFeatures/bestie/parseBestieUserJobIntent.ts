import { parseBestieDueAtFromText } from "./parseBestieUserListIntent";
import type { BestieJobAddInput, BestieJobSchedule } from "./bestieJobTypes";

/**
 * Natural-language job intents from the user in Bestie DM / popover.
 * Conservative shapes only.
 */
export type BestieUserJobIntent =
  | { job: BestieJobAddInput; op: "add" }
  | { op: "disable-match"; title: string }
  | { op: "remove-match"; title: string };

const ADD_ONCE_RE =
  /^(?:please\s+)?(?:schedule\s+(?:a\s+)?job|run\s+(?:a\s+)?job|create\s+(?:a\s+)?job)\s+(?:in\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)\s+)?(?:to\s+|:\s*)(.+)$/i;
const ADD_EVERY_RE =
  /^(?:please\s+)?(?:every\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h)|daily\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)\s*[,:]?\s*(?:run\s+)?(?:a\s+job\s+)?(?:to\s+|:\s*)?(.+)$/i;
const CANCEL_RE =
  /^(?:please\s+)?(?:cancel|stop|disable|remove|delete)\s+(?:the\s+)?job\s+(?:called\s+|named\s+)?["']?(.+?)["']?\.?$/i;

function durationSeconds(amount: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("m")) return amount * 60;
  if (u.startsWith("h")) return amount * 3600;
  return amount * 86400;
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.\s]+$/g, "").trim();
}

function titleFromPrompt(prompt: string): string {
  const first = prompt.split(/[.!\n]/)[0]?.trim() ?? prompt;
  if (first.length <= 48) return first;
  return `${first.slice(0, 45).trimEnd()}…`;
}

/**
 * Extract zero or one job intent from a user message body.
 */
export function parseBestieUserJobIntent(
  content: string,
  nowMs = Date.now(),
): BestieUserJobIntent | null {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 800) return null;
  const firstLine = trimmed.split(/\n/)[0]?.trim() ?? trimmed;

  const cancel = firstLine.match(CANCEL_RE);
  if (cancel) {
    const title = trimTrailingPunctuation(cancel[1] ?? "");
    if (!title) return null;
    const lower = firstLine.toLowerCase();
    if (
      lower.includes("cancel") ||
      lower.includes("remove") ||
      lower.includes("delete")
    ) {
      return { op: "remove-match", title };
    }
    return { op: "disable-match", title };
  }

  const every = firstLine.match(ADD_EVERY_RE);
  if (every) {
    const prompt = trimTrailingPunctuation(every[6] ?? "");
    if (!prompt) return null;
    let schedule: BestieJobSchedule;
    if (every[1] && every[2]) {
      schedule = {
        everySeconds: Math.max(60, durationSeconds(Number(every[1]), every[2])),
        kind: "interval",
      };
    } else {
      let hours = Number(every[3]);
      const minutes = every[4] != null ? Number(every[4]) : 0;
      const meridiem = (every[5] ?? "").toLowerCase();
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      schedule = { hour: hours, kind: "daily", minute: minutes };
    }
    return {
      job: {
        prompt,
        schedule,
        title: titleFromPrompt(prompt),
      },
      op: "add",
    };
  }

  const once = firstLine.match(ADD_ONCE_RE);
  if (once) {
    let body = trimTrailingPunctuation(once[3] ?? "");
    if (!body) return null;
    let dueAt: number | null = null;
    if (once[1] && once[2]) {
      dueAt =
        Math.floor(nowMs / 1000) + durationSeconds(Number(once[1]), once[2]);
    } else {
      const parsed = parseBestieDueAtFromText(body, nowMs);
      dueAt = parsed.dueAt;
      body = trimTrailingPunctuation(parsed.textWithoutDue);
    }
    if (!body) return null;
    if (dueAt == null) {
      dueAt = Math.floor(nowMs / 1000) + 5 * 60;
    }
    return {
      job: {
        prompt: body,
        schedule: { dueAt, kind: "once" },
        title: titleFromPrompt(body),
      },
      op: "add",
    };
  }

  return null;
}

export function messageLooksLikeBestieJobRequest(content: string): boolean {
  return parseBestieUserJobIntent(content) != null;
}
