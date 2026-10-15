import { AlarmClock, Bot, FilePen, Sparkles, Users, type LucideIcon } from "lucide-react";
import {
  INBOX_TABS,
  type InboxTab,
  type InboxTabCounts,
} from "@/features/home/lib/inboxTabs";
import { cn } from "@/shared/lib/cn";

const BADGE_CLASS =
  "pointer-events-none absolute right-0.5 top-0 z-10 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground";

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
      // Same tokens as the design-system SegmentedControl (shared/ui/segmented-control.tsx).
      className="flex h-8 w-full min-w-0 items-stretch rounded-md bg-muted/45 p-0.5"
      data-slot="segmented-control"
      data-testid="inbox-tab-bar"
      role="tablist"
    >
      <div className="grid w-full min-w-0 auto-cols-fr grid-flow-col gap-0.5">
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
              "relative flex h-full min-w-0 items-center justify-center rounded-md transition-colors duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`inbox-tab-${option.value}`}
            key={option.value}
            onClick={() => onTabChange(option.value)}
            role="tab"
            title={option.label}
            type="button"
          >
            <Icon aria-hidden className="h-4 w-4" />
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
