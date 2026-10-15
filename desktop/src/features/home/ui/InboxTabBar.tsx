import { AlarmClock, Bot, FilePen, Sparkles, Users, type LucideIcon } from "lucide-react";
import {
  INBOX_TABS,
  type InboxTab,
  type InboxTabCounts,
} from "@/features/home/lib/inboxTabs";
import { cn } from "@/shared/lib/cn";

const BADGE_CLASS =
  "pointer-events-none absolute -right-2 -top-2 z-10 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold leading-none text-primary-foreground ring-2 ring-background";

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
      className="flex min-w-0 items-center overflow-x-auto px-3 py-3 [scrollbar-width:none]"
      data-testid="inbox-tab-bar"
      role="tablist"
    >
      <div className="inline-flex shrink-0 items-stretch divide-x divide-border/60 rounded-2xl border border-border/60 bg-muted/40">
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
              "relative inline-flex size-16 shrink-0 sm:size-[72px] items-center justify-center transition-colors first:rounded-l-[15px] last:rounded-r-[15px] focus-visible:z-20 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              selected
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            data-testid={`inbox-tab-${option.value}`}
            key={option.value}
            onClick={() => onTabChange(option.value)}
            role="tab"
            title={option.label}
            type="button"
          >
            <Icon aria-hidden className="size-8 sm:size-9" strokeWidth={selected ? 2.25 : 1.75} />
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
