import { isBlockedPlaygroundPort } from "@/features/playground/lib/url";
import {
  PLAYGROUND_HULA,
  PLAYGROUND_VERSION,
  type PlaygroundCard,
} from "@/features/playground/lib/types";

const MAX_URL_LEN = 2048;
const MAX_NAME_LEN = 80;

export function normalizeBrowserSessionUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LEN) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname) return null;
  if (parsed.port && isBlockedPlaygroundPort(Number(parsed.port))) return null;
  return parsed.toString();
}

export function normalizeBrowserSessionName(
  raw: string,
  fallbackUrl: string,
): string {
  const trimmed = raw.trim();
  if (trimmed) return trimmed.slice(0, MAX_NAME_LEN);
  try {
    const host = new URL(fallbackUrl).hostname;
    if (host) return host.slice(0, MAX_NAME_LEN);
  } catch {
    // fall through
  }
  return "Browser";
}

function createBrowserSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `browser-${Date.now().toString(36)}`;
}

/** Build a playground card for a URL opened from the Browsers screen. */
export function buildBrowserSessionCard(input: {
  url: string;
  name?: string;
}): PlaygroundCard | null {
  const url = normalizeBrowserSessionUrl(input.url);
  if (!url) return null;
  return {
    hula: PLAYGROUND_HULA,
    v: PLAYGROUND_VERSION,
    name: normalizeBrowserSessionName(input.name ?? "", url),
    url,
    sid: createBrowserSessionId(),
  };
}
