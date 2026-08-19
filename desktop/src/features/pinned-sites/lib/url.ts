const MAX_PIN_URL_LEN = 2048;
const MAX_PIN_NAME_LEN = 80;

export function normalizePinnedSiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_PIN_URL_LEN) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (!parsed.hostname) return null;
  return parsed.toString();
}

export function normalizePinnedSiteName(raw: string): string | null {
  const name = raw.trim();
  if (!name || name.length > MAX_PIN_NAME_LEN) return null;
  return name;
}

export function urlsMatch(left: string, right: string): boolean {
  const a = normalizePinnedSiteUrl(left);
  const b = normalizePinnedSiteUrl(right);
  return a !== null && a === b;
}
