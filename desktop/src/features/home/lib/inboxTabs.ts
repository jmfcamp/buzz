// Inbox tabs: Inbox (people) / Agents / Reminders & Assistant.
// One shared source for tab membership, per-tab filters and badge counts so
// the Inbox tabs, sidebar/phone tab bar and the app icon badge never disagree.
import type { FeedItem } from "@/shared/api/types";
import type { InboxFilter } from "./inbox";
import { matchesInboxAllView } from "./inboxViewHelpers";
import { normalizePubkey } from "@/shared/lib/pubkey";

export type InboxTab = "inbox" | "agents" | "reminders";

export const INBOX_TABS: ReadonlyArray<{ value: InboxTab; label: string }> = [
  { value: "inbox", label: "Inbox" },
  { value: "agents", label: "Agents" },
  { value: "reminders", label: "Reminders & Assistant" },
];

export const INBOX_TAB_FILTERS: Record<
  InboxTab,
  ReadonlyArray<{ value: InboxFilter; label: string }>
> = {
  inbox: [
    { value: "all", label: "All" },
    { value: "project", label: "Projects" },
    { value: "dm", label: "Directs" },
    { value: "thread", label: "Thread replies" },
    { value: "mention", label: "Mentions" },
  ],
  agents: [
    { value: "all", label: "All" },
    { value: "needs_action", label: "Approvals" },
    { value: "agent_activity", label: "Activity" },
  ],
  reminders: [
    { value: "reminders", label: "Reminders" },
    { value: "drafts", label: "Drafts" },
  ],
};

export function defaultFilterForTab(tab: InboxTab): InboxFilter {
  return tab === "reminders" ? "reminders" : "all";
}

export function tabForFilter(filter: InboxFilter, current: InboxTab): InboxTab {
  if (INBOX_TAB_FILTERS[current].some((option) => option.value === filter)) {
    return current;
  }
  if (filter === "reminders" || filter === "drafts") return "reminders";
  if (filter === "needs_action" || filter === "agent_activity") return "agents";
  return "inbox";
}

/**
 * Agent notification kinds that show in the Agents tab but do not count
 * toward badges unless the user opts in (Task finished, PR opened). The
 * producers land in a later slice; items carry the kind in an `agent-notify`
 * tag.
 */
export const NON_BADGE_AGENT_NOTIFY_KINDS = new Set(["task_finished", "pr_opened"]);

type TabItem = {
  categories: readonly string[];
  groupItems?: readonly FeedItem[];
  item?: FeedItem;
};

function representative(item: TabItem): FeedItem | undefined {
  return item.item ?? item.groupItems?.at(-1);
}

export function isAgentsTabItem(
  item: TabItem,
  ownedAgentPubkeys: ReadonlySet<string>,
): boolean {
  if (item.categories.includes("needs_action")) return true;
  const rep = representative(item);
  return Boolean(rep && ownedAgentPubkeys.has(normalizePubkey(rep.pubkey)));
}

export function inboxTabOf(
  item: TabItem,
  ownedAgentPubkeys: ReadonlySet<string>,
): InboxTab | null {
  if (!matchesInboxAllView(item, ownedAgentPubkeys)) return null;
  return isAgentsTabItem(item, ownedAgentPubkeys) ? "agents" : "inbox";
}

export function agentNotifyKind(item: TabItem): string | null {
  const rep = representative(item);
  const tag = rep?.tags?.find((t) => t[0] === "agent-notify");
  return tag?.[1] ?? null;
}

export function countsTowardInboxBadge(
  item: TabItem,
  options?: { countAgentInfoItems?: boolean },
): boolean {
  if (options?.countAgentInfoItems) return true;
  const kind = agentNotifyKind(item);
  return kind === null || !NON_BADGE_AGENT_NOTIFY_KINDS.has(kind);
}

export type InboxTabCounts = {
  inbox: number;
  agents: number;
  reminders: number;
  total: number;
};

/** Per-tab unread counts plus the total that drives sidebar/app badges. Drafts never count; reminders only once due. */
export function computeInboxTabCounts(input: {
  items: ReadonlyArray<TabItem & { id: string }>;
  doneSet: ReadonlySet<string>;
  ownedAgentPubkeys: ReadonlySet<string>;
  dueReminderCount: number;
  countAgentInfoItems?: boolean;
}): InboxTabCounts {
  let inbox = 0;
  let agents = 0;
  for (const item of input.items) {
    if (input.doneSet.has(item.id)) continue;
    const tab = inboxTabOf(item, input.ownedAgentPubkeys);
    if (tab === null) continue;
    if (!countsTowardInboxBadge(item, input)) continue;
    if (tab === "agents") agents += 1;
    else inbox += 1;
  }
  const reminders = Math.max(0, input.dueReminderCount);
  return { inbox, agents, reminders, total: inbox + agents + reminders };
}
