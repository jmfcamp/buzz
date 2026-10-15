// Shared constants for "desktop as NIP-46 bunker" (sign in on web with your desktop). Pure; used by both sides.
// Transport: standard NIP-46 (kind 24133, NIP-44) over the Hula signer relay, so it works off the tailnet. The desktop has
// its own TRANSPORT key for this channel (not the account key); the account key never leaves the desktop.

export const BUNKER_RELAY = "wss://signer.huladesk.com";
/** Marker param in the bunker:// code so the web app knows it's a Hula Buzz desktop (not Clave/nsec.app). */
export const BUNKER_MARK = "buzz";
export const BUNKER_MARK_VALUE = "desktop";
/** A pairing code is good for one browser, for this long. */
export const BUNKER_CODE_TTL_MS = 5 * 60_000;
/** Kinds the desktop always asks about, even for an approved browser (JM: profile, follow list, deletes). */
export const BUNKER_ALWAYS_ASK_KINDS: ReadonlySet<number> = new Set([0, 3, 5]);
/** Custom method: the browser forgot this desktop, so revoke it on the desktop too. */
export const BUNKER_UNPAIR_METHOD = "buzz_unpair";

/** Approved browser: sign every kind silently except profile/follow list/deletes (JM-approved design). */
export const bunkerAutoKind = (kind: number) => !BUNKER_ALWAYS_ASK_KINDS.has(kind);

export function buildBunkerUri(
  transportPubkey: string,
  secret: string,
  relays: string[] = [BUNKER_RELAY],
): string {
  const p = new URLSearchParams();
  for (const r of relays) p.append("relay", r);
  p.set("secret", secret);
  p.set(BUNKER_MARK, BUNKER_MARK_VALUE);
  return `bunker://${transportPubkey}?${p.toString()}`;
}

export function isDesktopBunkerUri(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return (
      u.protocol === "bunker:" &&
      u.searchParams.get(BUNKER_MARK) === BUNKER_MARK_VALUE
    );
  } catch {
    return false;
  }
}
