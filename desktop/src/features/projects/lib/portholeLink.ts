type PortholePinLike = { name: string; url: string };

/**
 * The pinned website the user named Porthole. An exact name wins; a name or
 * URL that merely mentions Porthole is the fallback.
 */
export function findPortholePin<T extends PortholePinLike>(
  pins: readonly T[],
): T | null {
  return (
    pins.find((pin) => pin.name.trim().toLowerCase() === "porthole") ??
    pins.find(
      (pin) => /porthole/i.test(pin.name) || /porthole/i.test(pin.url),
    ) ??
    null
  );
}

/**
 * Porthole URL opened at one workspace path, in the same `?path=` form
 * Porthole links carry (see `portholeTarget`). No path keeps the root.
 * `https://porthole.example` + `Hula/products/hulabill`
 * → `https://porthole.example/?path=Hula/products/hulabill`.
 */
export function portholePathUrl(
  baseUrl: string,
  hulaPath: string | null | undefined,
): string | null {
  const trimmed = baseUrl.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const path = hulaPath?.trim().replace(/\/+$/, "") ?? "";
  if (!path) return url.toString();
  url.searchParams.delete("file");
  url.searchParams.set("path", path);
  // Slashes are legal in a query; keep the path readable.
  return url.toString().replaceAll("%2F", "/");
}
