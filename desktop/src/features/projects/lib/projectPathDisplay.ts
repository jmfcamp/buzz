export function shortenProjectPath(path: string, maxSegments = 3) {
  const trimmed = path.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replaceAll("\\", "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= maxSegments) return normalized;
  return `…/${segments.slice(-maxSegments).join("/")}`;
}

/**
 * Display path for a checkout, rooted at the Hula directory when present.
 * `/Users/jm/Documents/Hula/products/research` → `Hula/products/research`.
 * Paths without a Hula segment fall back to {@link shortenProjectPath}.
 */
export function hulaRootedDisplayPath(path: string, maxSegments = 3): string {
  const trimmed = path.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replaceAll("\\", "/").replace(/\/+$/, "");
  if (normalized === "Hula" || normalized.startsWith("Hula/")) {
    return normalized;
  }
  const marker = "/Hula/";
  const at = normalized.indexOf(marker);
  if (at !== -1) {
    return `Hula/${normalized.slice(at + marker.length)}`;
  }
  if (normalized.endsWith("/Hula")) return "Hula";
  const segments = normalized.split("/").filter(Boolean);
  const hulaIndex = segments.indexOf("Hula");
  if (hulaIndex >= 0) {
    return segments.slice(hulaIndex).join("/");
  }
  return shortenProjectPath(normalized, maxSegments);
}
