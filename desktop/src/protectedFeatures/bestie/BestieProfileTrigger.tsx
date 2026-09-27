import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { cn } from "@/shared/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { BestiePopover, BestieTriggerVisual } from "./BestiePopover";
import { useBestie } from "./useBestie";

/**
 * Anchored Bestie trigger for the sidebar profile footer.
 * Opens the Bestie popover chat. Does not navigate away.
 */
export function BestieProfileTrigger({ className }: { className?: string }) {
  const bestie = useBestie();
  const { goAgents } = useAppNavigation();
  const [open, setOpen] = React.useState(false);

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        if (nextOpen && !bestie.assignedAgent) {
          void goAgents();
          setOpen(false);
          return;
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <button
          aria-label={
            bestie.assignedAgent
              ? `Open Bestie chat with ${bestie.assignedAgent.name}`
              : "Choose a Bestie"
          }
          className={cn(
            "relative shrink-0 rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          data-testid="bestie-profile-trigger"
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <BestieTriggerVisual
            agent={bestie.assignedAgent}
            className="h-8 w-8"
            compact
            imageDraggable={false}
          />
        </button>
      </PopoverTrigger>
      {bestie.assignedAgent ? (
        <PopoverContent
          align="end"
          className="w-80"
          onClick={(event) => event.stopPropagation()}
          onOpenAutoFocus={(event) => {
            const target = event.currentTarget.querySelector(
              "[data-testid='bestie-composer']",
            );
            if (target instanceof HTMLElement) {
              event.preventDefault();
              target.focus();
            }
          }}
          side="top"
          sideOffset={10}
        >
          <BestiePopover onRequestClose={() => setOpen(false)} />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
