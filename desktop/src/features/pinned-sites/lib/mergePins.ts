import type { PinnedSite } from "./types";

/**
 * Community pins first (shared workspace), then personal pins that do not
 * collide on id. Order within each group is preserved.
 */
export function mergePinnedSites(
  personal: ReadonlyArray<PinnedSite>,
  community: ReadonlyArray<PinnedSite>,
): PinnedSite[] {
  const communityIds = new Set(community.map((pin) => pin.id));
  return [
    ...community.map((pin) => ({ ...pin, scope: "community" as const })),
    ...personal
      .filter((pin) => !communityIds.has(pin.id))
      .map((pin) => ({ ...pin, scope: "personal" as const })),
  ];
}
