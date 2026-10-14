// Web/PWA pinned sites render in a sandboxed iframe. A browser can't read a cross-origin frame's
// X-Frame-Options / frame-ancestors result, so "blocked" is a heuristic: known framing-hostile hosts
// skip straight to the fallback card, and anything that never fires `load` within the timeout falls back too.
export const WEB_PIN_FRAME_SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox";
export const WEB_PIN_FRAME_TIMEOUT_MS = 10_000;

// Big sites that always send X-Frame-Options DENY/SAMEORIGIN or frame-ancestors 'self'.
const KNOWN_BLOCKED_HOSTS = [
  "google.com",
  "youtube.com",
  "github.com",
  "gitlab.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "reddit.com",
  "amazon.com",
  "apple.com",
  "icloud.com",
  "microsoft.com",
  "live.com",
  "office.com",
  "notion.so",
  "slack.com",
  "discord.com",
  "stripe.com",
  "paypal.com",
  "chatgpt.com",
  "openai.com",
  "claude.ai",
  "anthropic.com",
  "cloudflare.com",
  "aws.amazon.com",
  "vercel.com",
  "netflix.com",
  "spotify.com",
  "figma.com",
  "atlassian.net",
  "zoom.us",
  "dropbox.com",
];

export function isKnownFrameBlockedUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  return KNOWN_BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Only http(s) may load in the frame; anything else goes straight to the fallback card. */
export function isFrameableScheme(url: string): boolean {
  try {
    const p = new URL(url).protocol;
    return p === "https:" || p === "http:";
  } catch {
    return false;
  }
}

// Hosts the user marked "always open outside" (the browser can't tell us a frame was blocked, so we remember).
const OUTSIDE_KEY = "buzz-web-pin-open-outside.v1";

function hostOf(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

export function readOpenOutsideHosts(
  storage: Pick<Storage, "getItem"> = localStorage,
): Set<string> {
  try {
    const v = JSON.parse(storage.getItem(OUTSIDE_KEY) || "[]");
    return new Set(
      Array.isArray(v)
        ? v.filter((h): h is string => typeof h === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

export function isOpenOutsideUrl(
  url: string,
  storage?: Pick<Storage, "getItem">,
): boolean {
  const h = hostOf(url);
  return !!h && readOpenOutsideHosts(storage).has(h);
}

export function setOpenOutsideUrl(
  url: string,
  on: boolean,
  storage: Storage = localStorage,
): void {
  const h = hostOf(url);
  if (!h) return;
  const hosts = readOpenOutsideHosts(storage);
  if (on) hosts.add(h);
  else hosts.delete(h);
  try {
    storage.setItem(OUTSIDE_KEY, JSON.stringify([...hosts]));
  } catch {
    /* storage full / private mode */
  }
}
