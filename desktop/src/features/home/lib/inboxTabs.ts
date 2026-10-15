import * as React from "react";
// Inbox tabs: People / Agents / Reminders / Assistant / Drafts.
// One shared source for tab membership, per-tab filters and badge counts so
// the Inbox tabs, sidebar/phone tab bar and the app icon badge never disagree.
import type { FeedItem } from "@/shared/api/types";
import type { InboxFilter } from "./inbox";
import { matchesInboxAllView } from "./inboxViewHelpers";
import { normalizePubkey } from "@/shared/lib/pubkey";

export type InboxTab = "inbox" | "agents" | "reminders" | "assistant" | "drafts";

export const INBOX_TABS: ReadonlyArray<{ value: InboxTab; label: string }> = [
  { value: "inbox", label: "People" },
  { value: "agents", label: "Agents" },
  { value: "reminders", label: "Reminders" },
  { value: "assistant", label: "Assistant" },
  { value: "drafts", label: "Drafts" },
];

export const INBOX_TAB_FILTERS: Record<
  InboxTab,
  ReadonlyArray<{ value: InboxFilter; label: string }>
> = {
  inbox: [
    { value: "all", label: "All" },
    { value: "project", label: "Projects" },
    { value: "channel", label: "Channels" },
    { value: "dm", label: "Directs" },
    { value: "thread", label: "Thread replies" },
    { value: "mention", label: "Mentions" },
  ],
  agents: [
    { value: "all", label: "All" },
    { value: "needs_action", label: "Approvals" },
    { value: "agent_needs_input", label: "Needs input" },
    { value: "agent_failed", label: "Failed" },
    { value: "agent_done", label: "Finished & PRs" },
    { value: "agent_activity", label: "All activity" },
  ],
  reminders: [{ value: "reminders", label: "Reminders" }],
  assistant: [{ value: "assistant", label: "Assistant" }],
  drafts: [{ value: "drafts", label: "Drafts" }],
};

export function defaultFilterForTab(tab: InboxTab): InboxFilter {
  if (tab === "reminders") return "reminders";
  if (tab === "assistant") return "assistant";
  if (tab === "drafts") return "drafts";
  return "all";
}

export function tabForFilter(filter: InboxFilter, current: InboxTab): InboxTab {
  if (INBOX_TAB_FILTERS[current].some((option) => option.value === filter)) {
    return current;
  }
  if (filter === "reminders") return "reminders";
  if (filter === "assistant") return "assistant";
  if (filter === "drafts") return "drafts";
  if (filter === "needs_action" || filter.startsWith("agent_")) return "agents";
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

/**
 * A message from your current Assistant agent (as:<pubkey> in inbox-state): its DM, thread replies to your Assist
 * messages, mentions — any feed item it authored. These go to the Assistant tab, never Agents. (Thread replies and
 * mention items do not always carry channelType "dm", so the author alone decides.)
 */
export function isAssistantItem(
  item: TabItem,
  assistantPubkey: string | null | undefined,
): boolean {
  if (!assistantPubkey) return false;
  const want = normalizePubkey(assistantPubkey);
  const rep = representative(item);
  if (rep && normalizePubkey(rep.pubkey) === want) return true;
  const group = item.groupItems ?? [];
  return group.length > 0 && group.every((g) => normalizePubkey(g.pubkey) === want);
}

export function inboxTabOf(
  item: TabItem,
  ownedAgentPubkeys: ReadonlySet<string>,
  assistantPubkey?: string | null,
): InboxTab | null {
  if (!matchesInboxAllView(item, ownedAgentPubkeys)) return null;
  if (isAssistantItem(item, assistantPubkey)) return "assistant";
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
  /** Due reminders. */
  reminders: number;
  /** Alias of `reminders` (kept for older callers). */
  dueReminders: number;
  /** Unread messages from your Assistant agent. */
  assistant: number;
  /** Drafts never carry a badge and never count toward the total. */
  drafts: 0;
  total: number;
};

/** Per-tab unread counts plus the total that drives sidebar/app badges. Drafts never count; reminders only once due. */
export function computeInboxTabCounts(input: {
  items: ReadonlyArray<TabItem & { id: string }>;
  doneSet: ReadonlySet<string>;
  ownedAgentPubkeys: ReadonlySet<string>;
  dueReminderCount: number;
  countAgentInfoItems?: boolean;
  assistantPubkey?: string | null;
}): InboxTabCounts {
  let inbox = 0;
  let agents = 0;
  let assistant = 0;
  for (const item of input.items) {
    if (input.doneSet.has(item.id)) continue;
    const tab = inboxTabOf(
      item,
      input.ownedAgentPubkeys,
      input.assistantPubkey,
    );
    if (tab === null) continue;
    if (!countsTowardInboxBadge(item, input)) continue;
    if (tab === "agents") agents += 1;
    else if (tab === "assistant") assistant += 1;
    else inbox += 1;
  }
  const dueReminders = Math.max(0, input.dueReminderCount);
  const reminders = dueReminders;
  return {
    inbox,
    agents,
    reminders,
    dueReminders,
    assistant,
    drafts: 0,
    total: inbox + agents + reminders + assistant,
  };
}

// "Count Task finished / PR opened toward badges" (Inbox ⋯ menu), per device.
const COUNT_AGENT_INFO_KEY = "buzz-inbox-count-agent-info.v1";
export const COUNT_AGENT_INFO_EVENT = "buzz-inbox-count-agent-info-changed";

export function readCountAgentInfoItems(): boolean {
  try {
    return window.localStorage.getItem(COUNT_AGENT_INFO_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeCountAgentInfoItems(value: boolean) {
  try {
    window.localStorage.setItem(COUNT_AGENT_INFO_KEY, value ? "true" : "false");
  } catch {
    /* quota */
  }
  window.dispatchEvent(new Event(COUNT_AGENT_INFO_EVENT));
}


export function useCountAgentInfoItems(): [boolean, (value: boolean) => void] {
  const [value, setValue] = React.useState(readCountAgentInfoItems);
  React.useEffect(() => {
    const onChange = () => setValue(readCountAgentInfoItems());
    window.addEventListener(COUNT_AGENT_INFO_EVENT, onChange);
    return () => window.removeEventListener(COUNT_AGENT_INFO_EVENT, onChange);
  }, []);
  return [value, writeCountAgentInfoItems];
}
