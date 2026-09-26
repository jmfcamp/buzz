/**
 * Hula desktop OS deep-link scheme (`com.huladesk.buzz`).
 *
 * In-app builders (`buildChannelLink`, `buildMessageLink`, entity links) emit
 * canonical `buzz://…` URLs. The OS register and Tauri deep-link handler for
 * this build accept `hulabuzz://…` (see `build_identity::deep_link_scheme`).
 * Rewrite before putting a link on the clipboard so another session can open it.
 *
 * Parsers must accept both schemes: users paste `hulabuzz://…` from Copy link,
 * while in-app markdown / builders still use `buzz://…`.
 */

export const CANONICAL_DEEP_LINK_SCHEME = "buzz";
export const APP_DEEP_LINK_SCHEME = "hulabuzz";

const CANONICAL_PREFIX = `${CANONICAL_DEEP_LINK_SCHEME}://`;
const APP_PREFIX = `${APP_DEEP_LINK_SCHEME}://`;

/** `URL.protocol` form (`buzz:` / `hulabuzz:`). */
export function isAcceptedDeepLinkProtocol(protocol: string): boolean {
  return (
    protocol === `${CANONICAL_DEEP_LINK_SCHEME}:` ||
    protocol === `${APP_DEEP_LINK_SCHEME}:`
  );
}

/**
 * Cheap prefix check for `buzz://host…` / `hulabuzz://host…` (with or without
 * query). Used by markdown pre-checks before full parse.
 */
export function isAcceptedDeepLinkHref(
  href: string | undefined | null,
  host: string,
): boolean {
  if (!href) return false;
  const canonical = `${CANONICAL_PREFIX}${host}`;
  const app = `${APP_PREFIX}${host}`;
  return (
    href === canonical ||
    href.startsWith(`${canonical}?`) ||
    href.startsWith(`${canonical}/`) ||
    href === app ||
    href.startsWith(`${app}?`) ||
    href.startsWith(`${app}/`)
  );
}

/** Rewrite a canonical `buzz://…` href to the OS-openable `hulabuzz://…` form. */
export function toAppDeepLink(href: string): string {
  if (href.startsWith(CANONICAL_PREFIX)) {
    return `${APP_PREFIX}${href.slice(CANONICAL_PREFIX.length)}`;
  }
  return href;
}
