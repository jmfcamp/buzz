import { AlarmClock, Bot, FilePen, Sparkles, Users, type LucideIcon } from "lucide-react";
import {
  INBOX_TABS,
  type InboxTab,
  type InboxTabCounts,
} from "@/features/home/lib/inboxTabs";
import { cn } from "@/shared/lib/cn";

const BADGE_CLASS =
  "pointer-events-none absolute right-0.5 top-0.5 z-10 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground";

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
      className="flex h-full w-full min-w-0 items-stretch"
      data-testid="inbox-tab-bar"
      role="tablist"
    >
      <div className="flex w-full min-w-0 items-stretch divide-x divide-border/60 border-r border-border/60">
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
              "relative inline-flex h-8 min-w-11 flex-1 basis-0 items-center justify-center transition-colors focus-visible:z-20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              selected
                ? "bg-primary/20 text-primary"
                : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            data-testid={`inbox-tab-${option.value}`}
            key={option.value}
            onClick={() => onTabChange(option.value)}
            role="tab"
            title={option.label}
            type="button"
          >
            <Icon aria-hidden className="size-[18px]" strokeWidth={selected ? 2.25 : 2} />
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
    </div>
  );
}
