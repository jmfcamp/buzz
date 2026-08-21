/** OpenClaw gateway default. */
export const OPENCLAW_GATEWAY_PORT = 18789;

/**
 * Common browser / Node inspector ports. Rejected so a playground card cannot
 * point the native webview at a debug listener.
 */
export const BROWSER_DEBUG_PORTS = [9222, 9223, 9229, 9230, 5858] as const;

const BLOCKED_PORTS = new Set<number>([
  OPENCLAW_GATEWAY_PORT,
  ...BROWSER_DEBUG_PORTS,
]);

export function isBlockedPlaygroundPort(port: number): boolean {
  return BLOCKED_PORTS.has(port);
}

/**
 * Accepts the card's `url` field as-is. Does not rewrite the string — only
 * reports whether it is an https app origin that is allowed to be probed.
 */
export function isAllowedPlaygroundUrl(raw: string): boolean {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") {
    return false;
  }
  if (!url.hostname) {
    return false;
  }
  if (url.port && isBlockedPlaygroundPort(Number(url.port))) {
    return false;
  }
  return true;
}
