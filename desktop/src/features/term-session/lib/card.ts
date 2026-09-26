import {
  isTermSessionTool,
  TERM_SESSION_HULA,
  TERM_SESSION_VERSION,
  type TermSessionCard,
} from "./types.ts";
import { rememberTermSessionPrompt } from "./promptStore.ts";

const TERM_SESSION_FENCE_RE = /```term-session(?:[^\n]*)\n([\s\S]*?)```/g;
/** Any markdown fence; used to catch `json` / unlabeled term-session payloads. */
const ANY_FENCE_RE = /```(?:[^\n]*)\n([\s\S]*?)```/g;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Parse one term-session card object. Required fields must be present and valid.
 * Optional `cwd` / `summary` / `openclawWorkspace` are copied only when present.
 * Fields are never rewritten.
 */
export function parseTermSessionCardValue(
  value: unknown,
): TermSessionCard | null {
  const candidate = asRecord(value);
  if (!candidate) {
    return null;
  }
  if (candidate.hula !== TERM_SESSION_HULA) {
    return null;
  }
  if (candidate.v !== TERM_SESSION_VERSION) {
    return null;
  }
  if (
    typeof candidate.name !== "string" ||
    candidate.name.trim().length === 0
  ) {
    return null;
  }
  if (!isTermSessionTool(candidate.tool)) {
    return null;
  }
  if (typeof candidate.sid !== "string" || candidate.sid.trim().length === 0) {
    return null;
  }
  if (typeof candidate.prompt !== "string" || candidate.prompt.length === 0) {
    return null;
  }

  const card: TermSessionCard = {
    hula: TERM_SESSION_HULA,
    v: TERM_SESSION_VERSION,
    name: candidate.name,
    tool: candidate.tool,
    sid: candidate.sid,
    prompt: candidate.prompt,
  };

  if (typeof candidate.cwd === "string" && candidate.cwd.trim().length > 0) {
    card.cwd = candidate.cwd;
  }
  if (
    typeof candidate.summary === "string" &&
    candidate.summary.trim().length > 0
  ) {
    card.summary = candidate.summary;
  }
  if (candidate.openclawWorkspace === true) {
    card.openclawWorkspace = true;
  }

  rememberTermSessionPrompt(card.sid, card.prompt);
  return card;
}

export function parseTermSessionCard(raw: string): TermSessionCard | null {
  if (typeof raw !== "string") {
    return null;
  }
  try {
    return parseTermSessionCardValue(JSON.parse(raw.trim()));
  } catch {
    return null;
  }
}

/** First `term-session` fence in a message, or a standalone JSON payload. */
export function extractTermSessionCard(
  content: string,
): TermSessionCard | null {
  if (typeof content !== "string") {
    return null;
  }
  const standalone = parseTermSessionCard(content);
  if (standalone) {
    return standalone;
  }
  TERM_SESSION_FENCE_RE.lastIndex = 0;
  const namedFence = TERM_SESSION_FENCE_RE.exec(content);
  if (namedFence?.[1]) {
    const card = parseTermSessionCard(namedFence[1]);
    if (card) {
      return card;
    }
  }
  ANY_FENCE_RE.lastIndex = 0;
  for (const match of content.matchAll(ANY_FENCE_RE)) {
    const card = parseTermSessionCard(match[1] ?? "");
    if (card) {
      return card;
    }
  }
  return null;
}

export function extractTermSessionCards(content: string): TermSessionCard[] {
  if (typeof content !== "string") {
    return [];
  }
  const cards: TermSessionCard[] = [];
  const seen = new Set<string>();
  const push = (card: TermSessionCard | null) => {
    if (!card || seen.has(card.sid)) {
      return;
    }
    seen.add(card.sid);
    cards.push(card);
  };

  TERM_SESSION_FENCE_RE.lastIndex = 0;
  for (const match of content.matchAll(TERM_SESSION_FENCE_RE)) {
    push(parseTermSessionCard(match[1] ?? ""));
  }
  ANY_FENCE_RE.lastIndex = 0;
  for (const match of content.matchAll(ANY_FENCE_RE)) {
    push(parseTermSessionCard(match[1] ?? ""));
  }
  if (cards.length === 0) {
    push(parseTermSessionCard(content));
  }
  return cards;
}
