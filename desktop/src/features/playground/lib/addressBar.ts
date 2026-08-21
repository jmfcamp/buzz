import { isAllowedPlaygroundUrl } from "./url.ts";

export type LockedPlaygroundUrl = {
  prefix: string;
  suffix: string;
};

/**
 * Lock the start URL through its last path slash. `https://host` and
 * `https://host/` both lock `https://host/`. A path like `/foo/bar` locks
 * `https://host/foo/` and leaves `bar` (plus query/hash) editable.
 */
export function splitLockedPlaygroundUrl(
  startUrl: string,
): LockedPlaygroundUrl {
  try {
    const url = new URL(startUrl);
    const path = url.pathname || "/";
    const slash = path.lastIndexOf("/");
    const pathPrefix = slash >= 0 ? path.slice(0, slash + 1) : "/";
    return {
      prefix: `${url.origin}${pathPrefix}`,
      suffix: `${path.slice(slash + 1)}${url.search}${url.hash}`,
    };
  } catch {
    const slash = startUrl.lastIndexOf("/");
    if (slash < 0) {
      return { prefix: startUrl, suffix: "" };
    }
    return {
      prefix: startUrl.slice(0, slash + 1),
      suffix: startUrl.slice(slash + 1),
    };
  }
}

export function suffixFromCurrentUrl(
  startUrl: string,
  currentUrl: string,
): string {
  const { prefix } = splitLockedPlaygroundUrl(startUrl);
  if (currentUrl.startsWith(prefix)) {
    return currentUrl.slice(prefix.length);
  }
  return splitLockedPlaygroundUrl(currentUrl).suffix;
}

export function joinPlaygroundUrl(prefix: string, suffix: string): string {
  return `${prefix}${suffix}`;
}

export function playgroundAddressNavigation(
  startUrl: string,
  suffix: string,
): { ok: true; url: string } | { ok: false; message: string } {
  const { prefix } = splitLockedPlaygroundUrl(startUrl);
  const url = joinPlaygroundUrl(prefix, suffix);
  if (!isAllowedPlaygroundUrl(url)) {
    return {
      ok: false,
      message: "Playground URL must stay https and off debug ports.",
    };
  }
  return { ok: true, url };
}
