/**
 * Hula Buzz desktop download destination.
 *
 * Hula ships one desktop build (Mac, Apple Silicon), published by
 * `scripts/hula-release.sh` to S3/CloudFront. The download page always shows
 * the current version, so there is no per-platform or GitHub-releases lookup
 * here (upstream Buzz resolved block/buzz GitHub assets and Block's mobile
 * store listings, which are not Hula builds).
 */
export const BUZZ_RELEASES_URL =
  "https://releases.huladesk.com/hula-buzz/download.html";

/** Deep-link scheme registered by the Hula Buzz desktop app. */
export const BUZZ_APP_SCHEME = "hulabuzz";

/** Product name shown wherever the page names the app. */
export const BUZZ_APP_NAME = "Hula Buzz";

/** `hulabuzz://join?relay=…&code=…[&policy_receipt=…]` for the invite landing page. */
export function buzzJoinDeepLink(
  relay: string,
  code: string,
  policyReceipt?: string,
): string {
  const query = new URLSearchParams({ relay, code });
  if (policyReceipt) query.set("policy_receipt", policyReceipt);
  return `${BUZZ_APP_SCHEME}://join?${query.toString()}`;
}
