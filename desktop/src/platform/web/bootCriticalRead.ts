type Filter = Record<string, unknown> & { kinds?: number[] };

/**
 * Small, boot-critical reads (project/repo announcements, their scoped
 * tombstones, community-section config, the viewer's own app-data lanes)
 * go straight to HTTP /query on the session bearer. On the shared socket
 * they queue behind connect + remote-signer AUTH and the ~130 channel REQs
 * (MAX_INFLIGHT 8), which measured 2.9 s for the section catalog and 10.5 s
 * for projects on iPhone; the relay answers /query in milliseconds.
 */
const BOOT_CRITICAL_KINDS = new Set([30617, 30621, 30625, 30078]);
export function isBootCriticalRead(filters: readonly Filter[]): boolean {
  return (
    filters.length > 0 &&
    filters.every((f) => {
      const kinds = f.kinds as number[] | undefined;
      if (!Array.isArray(kinds) || kinds.length === 0) return false;
      return kinds.every(
        (k) => BOOT_CRITICAL_KINDS.has(k) || (k === 5 && "#a" in f),
      );
    })
  );
}
