import { Bell, SquareArrowOutUpRight } from "lucide-react";

import { Button } from "@/shared/ui/button";
import {
  clearBestieNudge,
  useBestieNudge,
  type BestieNudge,
} from "./bestieNudgeStore";

const SNOOZE_OPTIONS_SECONDS = [
  { label: "+15 min", seconds: 15 * 60 },
  { label: "+1 hour", seconds: 60 * 60 },
] as const;

export function BestieNudgeBanner({
  onDismissItems,
  onOpenReminders,
  onSnoozeItems,
}: {
  /** Mark due reminders done (or advance recurring) then clear banner. */
  onDismissItems?: (itemIds: string[]) => void;
  /** Open Assistant Reminders RHS / sheet. */
  onOpenReminders?: () => void;
  /** Push dueAt forward for the nudged reminder ids. */
  onSnoozeItems?: (itemIds: string[], deltaSeconds: number) => void;
}) {
  const nudge = useBestieNudge();
  if (!nudge) return null;
  return (
    <BestieNudgeBannerView
      nudge={nudge}
      onDismissItems={onDismissItems}
      onOpenReminders={onOpenReminders}
      onSnoozeItems={onSnoozeItems}
    />
  );
}

export function BestieNudgeBannerView({
  nudge,
  onDismissItems,
  onOpenReminders,
  onSnoozeItems,
}: {
  nudge: BestieNudge;
  onDismissItems?: (itemIds: string[]) => void;
  onOpenReminders?: () => void;
  onSnoozeItems?: (itemIds: string[], deltaSeconds: number) => void;
}) {
  const isDueReminder = nudge.reason === "due-reminder";
  const dismiss = () => {
    if (isDueReminder && onDismissItems) {
      onDismissItems(nudge.itemIds);
    }
    clearBestieNudge();
  };
  const snooze = (deltaSeconds: number) => {
    onSnoozeItems?.(nudge.itemIds, deltaSeconds);
    clearBestieNudge();
  };

  return (
    <div
      className="flex shrink-0 items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-amber-950 dark:text-amber-100"
      data-testid="bestie-nudge-banner"
      role="status"
    >
      <Bell aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold">{nudge.title}</p>
        <p className="mt-0.5 text-xs leading-snug opacity-90">{nudge.body}</p>
        {isDueReminder ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Button
              className="h-6 px-2 text-2xs"
              data-testid="bestie-nudge-dismiss"
              onClick={dismiss}
              size="xs"
              type="button"
              variant="ghost"
            >
              Dismiss
            </Button>
            {onSnoozeItems
              ? SNOOZE_OPTIONS_SECONDS.map((option) => (
                  <Button
                    className="h-6 px-2 text-2xs"
                    data-testid={`bestie-nudge-snooze-${option.seconds}`}
                    key={option.seconds}
                    onClick={() => snooze(option.seconds)}
                    size="xs"
                    type="button"
                    variant="secondary"
                  >
                    {option.label}
                  </Button>
                ))
              : null}
          </div>
        ) : (
          <p className="mt-1 text-2xs opacity-70">
            Proactive Assistant check-in — not a normal DM.
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        {onOpenReminders && isDueReminder ? (
          <Button
            aria-label="Open Reminders"
            className="size-6"
            data-testid="bestie-nudge-open-reminders"
            onClick={onOpenReminders}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <SquareArrowOutUpRight className="size-3.5" />
          </Button>
        ) : null}
        {!isDueReminder ? (
          <Button
            className="h-6 px-2 text-2xs"
            data-testid="bestie-nudge-dismiss"
            onClick={dismiss}
            size="xs"
            type="button"
            variant="ghost"
          >
            Dismiss
          </Button>
        ) : null}
      </div>
    </div>
  );
}
