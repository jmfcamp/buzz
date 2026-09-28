import * as React from "react";

import { BESTIE_POPOVER_SHORTCUT_EVENT } from "@/shared/lib/keyboard-shortcuts";
import { cn } from "@/shared/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { BestiePopover, BestieTriggerVisual } from "./BestiePopover";
import {
  setBestiePopoverOpen,
  useBestieHasUnreadMessage,
} from "./bestieAttentionStore";
import { useBestieNudge } from "./bestieNudgeStore";
import {
  BESTIE_POPOVER_MAX_MAX_HEIGHT_PX,
  BESTIE_POPOVER_MAX_WIDTH_PX,
  BESTIE_POPOVER_MIN_MAX_HEIGHT_PX,
  BESTIE_POPOVER_MIN_WIDTH_PX,
  setBestiePopoverSize,
  useBestiePopoverSize,
} from "./bestiePopoverSizePreference";
import { useBestie } from "./useBestie";

/**
 * Anchored Bestie trigger for the sidebar profile footer.
 * Shows agent avatar at bottom; name appears beside it when assigned.
 * Left-nav label is "Assistant". Opens the Assistant popover chat.
 * No agent: still opens Assistant (empty); + inside the popover goes to Agents.
 * Phase 2: proactive wake nudge shows a distinct badge (not a DM unread).
 * Phase 3: due-reminder nudges auto-open the popover with the nudge banner.
 * Unread agent replies (popover + DM closed) show a pulsing light ring.
 *
 * Popover is always-on-top of the React chrome (high z-index) so it stacks
 * above the app UI. Pinned / playground WKWebViews stay mounted and visible
 * underneath — do not park or unmount them while the popover is open.
 * Drag-resizable (width + height) with persisted size and min/max clamps.
 */
export function BestieProfileTrigger({ className }: { className?: string }) {
  const bestie = useBestie();
  const [open, setOpen] = React.useState(false);
  const agent = bestie.assignedAgent;
  const nudge = useBestieNudge();
  const hasNudge = Boolean(nudge);
  const hasUnread = useBestieHasUnreadMessage();
  const lastAutoOpenedNudgeIdRef = React.useRef<string | null>(null);
  const popoverSize = useBestiePopoverSize();
  const dragRef = React.useRef<{
    kind: "width" | "height";
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

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

  // ⌘B / Ctrl+B — toggle Assistant popover (with or without an assigned agent).
  // detail.open === true forces open (sidebar no-agent path).
  React.useEffect(() => {
    function onShortcut(event: Event) {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      if (detail?.open === true) {
        setOpen(true);
        return;
      }
      setOpen((current) => !current);
    }
    window.addEventListener(BESTIE_POPOVER_SHORTCUT_EVENT, onShortcut);
    return () =>
      window.removeEventListener(BESTIE_POPOVER_SHORTCUT_EVENT, onShortcut);
  }, []);

  React.useEffect(() => {
    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === "width") {
        // align=end: dragging the left edge leftward grows width.
        const next = drag.startWidth + (drag.startX - event.clientX);
        setBestiePopoverSize({
          widthPx: Math.min(
            BESTIE_POPOVER_MAX_WIDTH_PX,
            Math.max(BESTIE_POPOVER_MIN_WIDTH_PX, next),
          ),
        });
        return;
      }
      // side=top: dragging the top edge upward grows max height.
      const next = drag.startHeight + (drag.startY - event.clientY);
      setBestiePopoverSize({
        maxHeightPx: Math.min(
          BESTIE_POPOVER_MAX_MAX_HEIGHT_PX,
          Math.max(BESTIE_POPOVER_MIN_MAX_HEIGHT_PX, next),
        ),
      });
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const ariaLabel = !agent
    ? "Open Assistant"
    : hasNudge
      ? `Open Assistant chat with ${agent.name} (check-in waiting)`
      : hasUnread
        ? `Open Assistant chat with ${agent.name} (new message)`
        : `Open Assistant chat with ${agent.name}`;

  return (
    <Popover onOpenChange={setOpen} open={open}>
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
            {agent && hasUnread && !hasNudge ? (
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
            {agent && hasNudge ? (
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
      <PopoverContent
        align="end"
        className="relative z-[300] w-auto max-w-none overflow-visible p-4"
        onClick={(event) => event.stopPropagation()}
        onOpenAutoFocus={(event) => {
          const content = event.currentTarget;
          if (!(content instanceof HTMLElement)) return;
          const target = content.querySelector(
            "[data-testid='bestie-composer'], [data-testid='bestie-assign-agent']",
          );
          if (target instanceof HTMLElement) {
            event.preventDefault();
            target.focus();
          }
        }}
        side="top"
        sideOffset={10}
        style={
          {
            width: popoverSize.widthPx,
            minWidth: BESTIE_POPOVER_MIN_WIDTH_PX,
            maxWidth: BESTIE_POPOVER_MAX_WIDTH_PX,
            ["--bestie-popover-max-h" as string]: `${popoverSize.maxHeightPx}px`,
          } as React.CSSProperties
        }
      >
        <BestiePopover onRequestClose={() => setOpen(false)} />
        {/* Resize handles AFTER content so they stay above chat/Lists hit targets.
            Do not setPointerCapture here — move/up listen on window; capture
            would retarget those events away from window and freeze width drag.
            w-auto + max-w-none override PopoverContent's default w-72. */}
        <div
          aria-label="Resize Assistant width"
          className="absolute -left-1 bottom-2 top-2 z-20 w-3 cursor-ew-resize touch-none rounded-full bg-transparent hover:bg-border/80"
          data-testid="bestie-popover-resize-width"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dragRef.current = {
              kind: "width",
              startX: event.clientX,
              startY: event.clientY,
              startWidth: popoverSize.widthPx,
              startHeight: popoverSize.maxHeightPx,
            };
          }}
        />
        <div
          aria-label="Resize Assistant height"
          className="absolute -top-1 left-2 right-2 z-20 h-3 cursor-ns-resize touch-none rounded-full bg-transparent hover:bg-border/80"
          data-testid="bestie-popover-resize-height"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            dragRef.current = {
              kind: "height",
              startX: event.clientX,
              startY: event.clientY,
              startWidth: popoverSize.widthPx,
              startHeight: popoverSize.maxHeightPx,
            };
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
