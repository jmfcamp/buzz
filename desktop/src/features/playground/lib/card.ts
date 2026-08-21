import {
  PLAYGROUND_HULA,
  PLAYGROUND_VERSION,
  type PlaygroundCard,
} from "./types.ts";
import { isAllowedPlaygroundUrl } from "./url.ts";

const FENCE_RE = /```playground(?:[^\n]*)\n([\s\S]*?)```/g;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Parse one playground card object. Required fields must be present and valid.
 * Optional `stack` / `expires` are copied only when present. Fields are never
 * rewritten.
 */
export function parsePlaygroundCardValue(
  value: unknown,
): PlaygroundCard | null {
  const candidate = asRecord(value);
  if (!candidate) {
    return null;
  }
  if (candidate.hula !== PLAYGROUND_HULA) {
    return null;
  }
  if (candidate.v !== PLAYGROUND_VERSION) {
    return null;
  }
  if (
    typeof candidate.name !== "string" ||
    candidate.name.trim().length === 0
  ) {
    return null;
  }
  if (
    typeof candidate.url !== "string" ||
    !isAllowedPlaygroundUrl(candidate.url)
  ) {
    return null;
  }
  if (typeof candidate.pin !== "string" || candidate.pin.trim().length === 0) {
    return null;
  }
  if (typeof candidate.sid !== "string" || candidate.sid.trim().length === 0) {
    return null;
  }

  const card: PlaygroundCard = {
    hula: PLAYGROUND_HULA,
    v: PLAYGROUND_VERSION,
    name: candidate.name,
    url: candidate.url,
    pin: candidate.pin,
    sid: candidate.sid,
  };

  if (typeof candidate.stack === "string" && candidate.stack.length > 0) {
    card.stack = candidate.stack;
  }
  if (
    typeof candidate.expires === "string" ||
    typeof candidate.expires === "number"
  ) {
    card.expires = candidate.expires;
  }

  return card;
}

export function parsePlaygroundCard(raw: string): PlaygroundCard | null {
  if (typeof raw !== "string") {
    return null;
  }
  try {
    return parsePlaygroundCardValue(JSON.parse(raw.trim()));
  } catch {
    return null;
  }
}

/** First `playground` fence in a message, or a standalone JSON payload. */
export function extractPlaygroundCard(content: string): PlaygroundCard | null {
  if (typeof content !== "string") {
    return null;
  }
  const standalone = parsePlaygroundCard(content);
  if (standalone) {
    return standalone;
  }
  FENCE_RE.lastIndex = 0;
  const match = FENCE_RE.exec(content);
  if (!match?.[1]) {
    return null;
  }
  return parsePlaygroundCard(match[1]);
}

export function extractPlaygroundCards(content: string): PlaygroundCard[] {
  if (typeof content !== "string") {
    return [];
  }
  const cards: PlaygroundCard[] = [];
  const seen = new Set<string>();
  const push = (card: PlaygroundCard | null) => {
    if (!card || seen.has(card.sid)) {
      return;
    }
    seen.add(card.sid);
    cards.push(card);
  };

  FENCE_RE.lastIndex = 0;
  for (const match of content.matchAll(FENCE_RE)) {
    push(parsePlaygroundCard(match[1] ?? ""));
  }
  if (cards.length === 0) {
    push(parsePlaygroundCard(content));
  }
  return cards;
}
