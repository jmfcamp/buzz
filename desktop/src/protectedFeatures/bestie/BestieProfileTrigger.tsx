import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { BESTIE_POPOVER_SHORTCUT_EVENT } from "@/shared/lib/keyboard-shortcuts";
import { cn } from "@/shared/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { BestiePopover, BestieTriggerVisual } from "./BestiePopover";
import {
  setBestiePopoverOpen,
  useBestieHasUnreadMessage,
} from "./bestieAttentionStore";
import { useBestieNudge } from "./bestieNudgeStore";
import { useBestie } from "./useBestie";

/**
 * Anchored Bestie trigger for the sidebar profile footer.
 * Shows agent avatar + name here; left-nav label stays "Bestie".
 * Opens the Bestie popover chat. Does not navigate away.
 * Phase 2: proactive wake nudge shows a distinct badge (not a DM unread).
 * Phase 3: due-reminder nudges auto-open the popover with the nudge banner.
 * Unread agent replies (popover + DM closed) show a pulsing light ring.
 */
export function BestieProfileTrigger({ className }: { className?: string }) {
  const bestie = useBestie();
  const { goAgents } = useAppNavigation();
  const [open, setOpen] = React.useState(false);
  const agent = bestie.assignedAgent;
  const nudge = useBestieNudge();
  const hasNudge = Boolean(nudge);
  const hasUnread = useBestieHasUnreadMessage();
  const lastAutoOpenedNudgeIdRef = React.useRef<string | null>(null);

  // Keep attention store in sync with popover open state.
  React.useEffect(() => {
    setBestiePopoverOpen(open);
    return () => setBestiePopoverOpen(false);
  }, [open]);

  // Auto-open when a *due reminder* nudge fires (distinct from todos check-in).
  React.useEffect(() => {
    if (!agent || !nudge || nudge.reason !== "due-reminder") return;
    if (lastAutoOpenedNudgeIdRef.current === nudge.id) return;
    lastAutoOpenedNudgeIdRef.current = nudge.id;
    setOpen(true);
  }, [agent, nudge]);

  // ⇧⌘B / Ctrl+Shift+B — toggle popover (or go choose a Bestie when unset).
  React.useEffect(() => {
    function onShortcut() {
      if (!agent) {
        void goAgents();
        setOpen(false);
        return;
      }
      setOpen((current) => !current);
    }
    window.addEventListener(BESTIE_POPOVER_SHORTCUT_EVENT, onShortcut);
    return () =>
      window.removeEventListener(BESTIE_POPOVER_SHORTCUT_EVENT, onShortcut);
  }, [agent, goAgents]);

  const ariaLabel = agent
    ? hasNudge
      ? `Open Bestie chat with ${agent.name} (check-in waiting)`
      : hasUnread
        ? `Open Bestie chat with ${agent.name} (new message)`
        : `Open Bestie chat with ${agent.name}`
    : "Choose a Bestie";

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        if (nextOpen && !agent) {
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
          aria-label={ariaLabel}
          className={cn(
            "relative flex max-w-[42%] shrink-0 items-center gap-1.5 rounded-full outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
          data-testid="bestie-profile-trigger"
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <span className="relative inline-flex shrink-0">
            {hasUnread && !hasNudge ? (
              <span
                aria-hidden="true"
                className="bestie-unread-ring pointer-events-none absolute -inset-1 rounded-full"
                data-testid="bestie-unread-ring"
              />
            ) : null}
            <BestieTriggerVisual
              agent={agent}
              className="h-8 w-8"
              compact
              imageDraggable={false}
            />
            {hasNudge ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold leading-none text-amber-950 ring-2 ring-sidebar"
                data-testid="bestie-nudge-badge"
              >
                !
              </span>
            ) : null}
          </span>
          {agent ? (
            <span
              className="min-w-0 truncate text-xs font-medium text-sidebar-foreground"
              data-testid="bestie-profile-agent-name"
            >
              {agent.name}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      {agent ? (
        <PopoverContent
          align="end"
          className="w-80"
          onClick={(event) => event.stopPropagation()}
          onOpenAutoFocus={(event) => {
            const content = event.currentTarget;
            if (!(content instanceof HTMLElement)) return;
            const target = content.querySelector(
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
