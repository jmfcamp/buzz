import { ChevronDown, Plus } from "lucide-react";
import * as React from "react";

import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { BESTIE_COFFEE_BREW_EVENT } from "./bestieCoffeeSchedule";
import {
  abandonBestieCoffeePendingForScope,
  beginBestieCoffeeRunForScope,
} from "./bestieCoffeeStore";
import {
  setBestiePopoverListsCollapsed,
  useBestiePopoverListsCollapsed,
} from "./bestiePopoverListsPreference";
import { subscribeBestieRhsOpen } from "./bestieRhsOpenRequest";
import { BestieDmCategorySheet, BestieDmRhsPanel } from "./BestieDmRhsPanel";
import { BestieDmCoffeeSheet } from "./BestieDmCoffeeSheet";
import { BestieDmJobsSheet } from "./BestieDmJobsSheet";
import { BestieDmScratchSheet } from "./BestieDmScratchSheet";
import { BestieDmThreadsSheet } from "./BestieDmThreadsSheet";
import { BestieDmTodosSheet } from "./BestieDmTodosSheet";
import { bestieCategoryTitle, type BestieRhsKind } from "./bestieDmRhsHelpers";
import type { BestieListScope } from "./bestieListTypes";
import { useBestieCoffeeLive } from "./useBestieCoffeeLive";
import { useBestieThreadSummarizeLive } from "./useBestieThreadSummarizeLive";
import type { Channel } from "@/shared/api/types";

/**
 * Collapsible Lists section for the Assistant popover (no-agent + agent).
 * Same category rows as the Bestie DM RHS: Reminders / To-dos / Jobs / Coffee /
 * Threads / Scratch. Collapse preference is shared across both modes.
 */
export function BestiePopoverListsSection({
  bestieChannel = null,
  brewEnabled = false,
  fillAvailable = false,
  scope,
}: {
  /** Assistant DM channel — enables Coffee/Threads live indicators when set. */
  bestieChannel?: Channel | null;
  /** When false (no-agent), Coffee Brew stays disabled. */
  brewEnabled?: boolean;
  /** Grow into leftover popover height (no-agent empty state). */
  fillAvailable?: boolean;
  scope: BestieListScope;
}) {
  const listsCollapsed = useBestiePopoverListsCollapsed();
  const [activeKind, setActiveKind] = React.useState<BestieRhsKind | null>(
    null,
  );
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => {
    return subscribeBestieRhsOpen((kind) => {
      setBestiePopoverListsCollapsed(false);
      setAdding(false);
      setActiveKind(kind);
    });
  }, []);

  const liveChannel = brewEnabled ? bestieChannel : null;
  const { brewDisabled, coffeeLive } = useBestieCoffeeLive(scope, liveChannel);
  const { summarizeDisabled, summarizeLive, summarizeLiveThreadId } =
    useBestieThreadSummarizeLive(scope, liveChannel);

  const requestCoffeeBrew = React.useCallback(() => {
    if (!brewEnabled || brewDisabled) return;
    let begun = beginBestieCoffeeRunForScope(scope, "brew");
    if (!begun) {
      abandonBestieCoffeePendingForScope(scope);
      begun = beginBestieCoffeeRunForScope(scope, "brew");
    }
    if (!begun) return;
    window.dispatchEvent(
      new CustomEvent(BESTIE_COFFEE_BREW_EVENT, {
        detail: { agentPubkey: scope.agentPubkey },
      }),
    );
  }, [brewDisabled, brewEnabled, scope]);

  const openKind = React.useCallback((kind: BestieRhsKind) => {
    setBestiePopoverListsCollapsed(false);
    setAdding(false);
    setActiveKind((current) => (current === kind ? null : kind));
  }, []);

  const sheet =
    activeKind == null ? null : activeKind === "job" ? (
      <BestieDmJobsSheet
        adding={adding}
        onRequestAdd={() => setAdding(true)}
        scope={scope}
      />
    ) : activeKind === "coffee" ? (
      <BestieDmCoffeeSheet
        brewDisabled={!brewEnabled || brewDisabled}
        coffeeLive={Boolean(brewEnabled && coffeeLive)}
        onBrew={requestCoffeeBrew}
        scope={scope}
      />
    ) : activeKind === "thread" ? (
      <BestieDmThreadsSheet
        adding={adding}
        onRequestAdd={() => setAdding(true)}
        scope={scope}
        summarizeDisabled={!brewEnabled || summarizeDisabled}
        summarizeLive={Boolean(brewEnabled && summarizeLive)}
        summarizeLiveThreadId={brewEnabled ? summarizeLiveThreadId : null}
      />
    ) : activeKind === "scratch" ? (
      <BestieDmScratchSheet
        adding={adding}
        onAdded={() => setAdding(false)}
        onRequestAdd={() => setAdding(true)}
        scope={scope}
      />
    ) : activeKind === "todo" ? (
      <BestieDmTodosSheet
        adding={adding}
        onRequestAdd={() => setAdding(true)}
        scope={scope}
      />
    ) : (
      <BestieDmCategorySheet
        adding={adding}
        kind={activeKind}
        onRequestAdd={() => setAdding(true)}
        scope={scope}
      />
    );

  return (
    <div
      className={cn(
        "min-h-0 border-t border-border/60 pt-2",
        fillAvailable ? "flex min-h-0 flex-1 flex-col" : "shrink-0",
      )}
      data-testid="bestie-popover-lists"
    >
      <button
        aria-controls="bestie-popover-lists-body"
        aria-expanded={!listsCollapsed}
        className="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        data-testid="bestie-popover-lists-toggle"
        onClick={() => {
          const next = !listsCollapsed;
          setBestiePopoverListsCollapsed(next);
          if (next) {
            setActiveKind(null);
            setAdding(false);
          }
        }}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">Lists</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            listsCollapsed && "-rotate-90",
          )}
        />
      </button>

      {!listsCollapsed ? (
        <div
          className={cn(
            // Category rows stay in flow and set this block's height. A drilled
            // list overlays that box, so a short list cannot shrink it.
            "relative min-h-0 pt-1",
            fillAvailable && "flex-1 overflow-hidden",
          )}
          data-testid="bestie-popover-lists-body"
          id="bestie-popover-lists-body"
        >
          <div
            aria-hidden={activeKind != null ? true : undefined}
            className={cn(activeKind != null && "invisible")}
            inert={activeKind != null ? true : undefined}
          >
            <BestieDmRhsPanel
              activeKind={activeKind}
              coffeeLive={Boolean(brewEnabled && coffeeLive)}
              compact
              onOpenKind={openKind}
              scope={scope}
              summarizeLive={Boolean(brewEnabled && summarizeLive)}
            />
          </div>
          {activeKind != null && sheet ? (
            <div
              className="absolute inset-0 overflow-y-auto"
              data-testid="bestie-popover-lists-sheet"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <Button
                    className="h-7 gap-1 rounded-full border border-border/50 bg-muted/45 px-2.5 text-xs font-medium text-foreground shadow-none hover:bg-muted/70"
                    data-testid="bestie-popover-lists-back"
                    onClick={() => {
                      setActiveKind(null);
                      setAdding(false);
                    }}
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    Back
                  </Button>
                  <span className="text-xs font-medium">
                    {bestieCategoryTitle(activeKind)}
                  </span>
                  {activeKind !== "coffee" ? (
                    <Button
                      aria-label={`Add ${bestieCategoryTitle(activeKind)}`}
                      aria-pressed={adding}
                      className="ml-auto h-7 w-7"
                      data-testid="bestie-popover-lists-add"
                      onClick={() => setAdding((value) => !value)}
                      size="icon"
                      type="button"
                      variant={adding ? "secondary" : "ghost"}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                {sheet}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
