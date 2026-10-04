import { ListPlus } from "lucide-react";

import { Button } from "@/shared/ui/button";

/**
 * Assistant banner when the footer agent light was list-only: no new chat
 * message, but reminders / to-dos / threads / scratch notes / jobs were added.
 * Same card chrome as the New message and nudge banners.
 */
export function BestieListIntroBanner({
  onDismiss,
  text,
}: {
  onDismiss: () => void;
  text: string;
}) {
  return (
    <div
      className="flex shrink-0 items-start gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-sky-950 dark:text-sky-100"
      data-testid="bestie-list-intro-banner"
      role="status"
    >
      <ListPlus aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p
          className="text-xs font-semibold"
          data-testid="bestie-list-intro-banner-text"
        >
          {text}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Button
            className="h-6 px-2 text-2xs"
            data-testid="bestie-list-intro-dismiss"
            onClick={onDismiss}
            size="xs"
            type="button"
            variant="ghost"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
