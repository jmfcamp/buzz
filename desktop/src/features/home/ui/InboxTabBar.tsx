import { AlarmClock, Bot, FilePen, Sparkles, Users, type LucideIcon } from "lucide-react";
import {
  INBOX_TABS,
  type InboxTab,
  type InboxTabCounts,
} from "@/features/home/lib/inboxTabs";
import { cn } from "@/shared/lib/cn";

const BADGE_CLASS =
  "pointer-events-none absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold leading-none text-primary-foreground ring-2 ring-background";

const TAB_ICONS: Record<InboxTab, LucideIcon> = {
  inbox: Users,
  agents: Bot,
  reminders: AlarmClock,
  assistant: Sparkles,
  drafts: FilePen,
};

function formatBadge(n: number) {
  return n > 99 ? "99+" : String(n);
}

/** People / Agents / Reminders / Assistant / Drafts icon tabs, each with its own unread badge. */
export function InboxTabBar({
  counts,
  onTabChange,
  tab,
}: {
  counts: InboxTabCounts | undefined;
  onTabChange: (tab: InboxTab) => void;
  tab: InboxTab;
}) {
  return (
    <div
      aria-label="Inbox sections"
      className="flex min-w-0 items-center gap-1 overflow-x-auto px-1 pt-1 [scrollbar-width:none]"
      data-testid="inbox-tab-bar"
      role="tablist"
    >
      {INBOX_TABS.map((option) => {
        const selected = option.value === tab;
        const count = counts?.[option.value] ?? 0;
        const Icon = TAB_ICONS[option.value];
        const label = count > 0 ? `${option.label}, ${count} unread` : option.label;
        return (
          <button
            aria-label={label}
            aria-selected={selected}
            className={cn(
              "relative inline-flex h-8 w-9 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
              selected
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            data-testid={`inbox-tab-${option.value}`}
            key={option.value}
            onClick={() => onTabChange(option.value)}
            role="tab"
            title={option.label}
            type="button"
          >
            <Icon aria-hidden className="h-[18px] w-[18px]" strokeWidth={selected ? 2.25 : 1.75} />
            {count > 0 ? (
              <span
                className={BADGE_CLASS}
                data-testid={`inbox-tab-badge-${option.value}`}
              >
                {formatBadge(count)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
