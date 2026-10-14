// Client for the relay's `buzz_inbox` /query extension (buzz_db::inbox). Clients use it only when the
// relay's NIP-11 advertises `buzz_inbox.version === 1`; otherwise every caller falls back to the
// client-side eligibility rules (inboxEligibility.ts / notificationInbox.ts).
import { getRelayHttpUrl, invokeTauri } from "@/shared/api/tauri";
import type { RelayEvent } from "@/shared/api/types";

export type BuzzInboxCategory =
  | "mention"
  | "needs_action"
  | "dm"
  | "thread_reply";
export type BuzzInboxItem = { category: BuzzInboxCategory; event: RelayEvent };
export type BuzzInboxPage = {
  items: BuzzInboxItem[];
  nextUntil: number | null;
};

const CATEGORIES = new Set<string>([
  "mention",
  "needs_action",
  "dm",
  "thread_reply",
]);
const support = new Map<string, Promise<boolean>>();

export function parseBuzzInboxInfo(info: unknown): boolean {
  const b = (info as { buzz_inbox?: { version?: unknown } } | null)?.buzz_inbox;
  return b?.version === 1;
}

export function parseBuzzInboxPage(raw: unknown): BuzzInboxPage | null {
  const r = raw as {
    buzz_inbox?: unknown;
    items?: unknown;
    next_until?: unknown;
  } | null;
  if (!r || r.buzz_inbox !== 1 || !Array.isArray(r.items)) return null;
  const items: BuzzInboxItem[] = [];
  for (const it of r.items as { category?: unknown; event?: RelayEvent }[]) {
    const ev = it?.event;
    if (typeof it?.category !== "string" || !CATEGORIES.has(it.category))
      continue;
    if (!ev || typeof ev.id !== "string" || !Array.isArray(ev.tags)) continue;
    items.push({ category: it.category as BuzzInboxCategory, event: ev });
  }
  return {
    items,
    nextUntil: typeof r.next_until === "number" ? r.next_until : null,
  };
}

/** Cached per relay HTTP base. A failed probe is retried on the next call. */
export async function relaySupportsBuzzInbox(): Promise<boolean> {
  let base: string;
  try {
    base = (await getRelayHttpUrl()).replace(/\/+$/, "");
  } catch {
    return false;
  }
  let p = support.get(base);
  if (!p) {
    p = fetch(`${base}/info`, { headers: { Accept: "application/nostr+json" } })
      .then(async (res) =>
        res.ok ? parseBuzzInboxInfo(await res.json()) : false,
      )
      .catch(() => {
        support.delete(base);
        return false;
      });
    support.set(base, p);
  }
  return p;
}

/** One server-side Inbox page, or null when the relay lacks it or the call fails (caller falls back). */
export async function fetchBuzzInboxPage(args: {
  until?: number;
  limit?: number;
  roots?: readonly string[];
}): Promise<BuzzInboxPage | null> {
  if (!(await relaySupportsBuzzInbox())) return null;
  try {
    const raw = await invokeTauri<unknown>("query_buzz_inbox", {
      until: args.until,
      limit: args.limit ?? 50,
      roots: args.roots?.length ? [...args.roots].slice(0, 500) : undefined,
    });
    return parseBuzzInboxPage(raw);
  } catch (error) {
    console.warn("[buzz_inbox] falling back to client-side Inbox:", error);
    return null;
  }
}

/** Mentions + approvals for the shared Home-feed builder. */
export async function buzzInboxFeedEvents(args: {
  until?: number;
  limit: number;
}) {
  const page = await fetchBuzzInboxPage(args);
  if (!page) return null;
  return page.items
    .filter((i) => i.category === "mention" || i.category === "needs_action")
    .map((i) => i.event);
}
