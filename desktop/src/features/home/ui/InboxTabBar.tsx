import type { InboxFilter } from "@/features/home/lib/inbox";
import {
  INBOX_TABS,
  type InboxTab,
  type InboxTabCounts,
} from "@/features/home/lib/inboxTabs";
import { cn } from "@/shared/lib/cn";

const BADGE_CLASS =
  "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold leading-none text-primary-foreground";

function formatBadge(n: number) {
  return n > 99 ? "99+" : String(n);
}

/** People / Agents / For you / Drafts tabs, each with its own unread badge. */
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
      className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]"
      data-testid="inbox-tab-bar"
      role="tablist"
    >
      {INBOX_TABS.map((option) => {
        const selected = option.value === tab;
        const count = counts?.[option.value] ?? 0;
        return (
          <button
            aria-selected={selected}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
              selected
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            data-testid={`inbox-tab-${option.value}`}
            key={option.value}
            onClick={() => onTabChange(option.value)}
            role="tab"
            title={option.label}
            type="button"
          >
            <span>
              {option.label}
            </span>
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

/** Reminders / Assistant chips for the "For you" tab. */
export function InboxReminderChips({
  counts,
  filter,
  onFilterChange,
}: {
  counts: InboxTabCounts | undefined;
  filter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
}) {
  const chips: Array<{ value: InboxFilter; label: string; count: number }> = [
    { value: "reminders", label: "Reminders", count: counts?.dueReminders ?? 0 },
    { value: "assistant", label: "Assistant", count: counts?.assistant ?? 0 },
  ];
  return (
    <div className="flex items-center gap-1" data-testid="inbox-reminder-chips">
      {chips.map((chip) => {
        const selected = filter === chip.value;
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors",
              selected
                ? "border-foreground/20 bg-muted text-foreground"
                : "border-border/60 text-muted-foreground hover:bg-muted/60",
            )}
            data-testid={`inbox-chip-${chip.value}`}
            key={chip.value}
            onClick={() => onFilterChange(chip.value)}
            type="button"
          >
            {chip.label}
            {chip.count > 0 ? (
              <span className={BADGE_CLASS}>{formatBadge(chip.count)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
