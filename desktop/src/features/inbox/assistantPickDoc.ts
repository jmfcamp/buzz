// Pure helpers for the synced assistant pick (see assistantPick.ts).
import type { InboxStateDoc } from "./inboxStateDoc";

export const ASSISTANT_PICK_PREFIX = "as:";
export const HEX64 = /^[0-9a-f]{64}$/;

export function isAssistantPickId(id: string) {
  return id.startsWith(ASSISTANT_PICK_PREFIX);
}

/** The picked assistant's pubkey, or null. Newest live `as:` entry wins. */
export function assistantFromDoc(
  doc: InboxStateDoc | null | undefined,
): string | null {
  if (!doc) return null;
  let best: { pk: string; at: number } | null = null;
  for (const [id, e] of Object.entries(doc.lanes.followed)) {
    if (!e.on || !isAssistantPickId(id)) continue;
    const pk = id.slice(ASSISTANT_PICK_PREFIX.length).toLowerCase();
    if (!HEX64.test(pk)) continue;
    if (!best || e.at > best.at || (e.at === best.at && pk > best.pk))
      best = { pk, at: e.at };
  }
  return best?.pk ?? null;
}
