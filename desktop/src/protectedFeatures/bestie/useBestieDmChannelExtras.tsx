import { ListTodo, Plus } from "lucide-react";
import * as React from "react";

import { findBestieDmChannel } from "./filterBestieDmChannels";
import { BestieDmCategorySheet, BestieDmRhsPanel } from "./BestieDmRhsPanel";
import { BestieDmCoffeeSheet } from "./BestieDmCoffeeSheet";
import { BestieDmJobsSheet } from "./BestieDmJobsSheet";
import { BestieDmThreadsSheet } from "./BestieDmThreadsSheet";
import { BestieDmScratchSheet } from "./BestieDmScratchSheet";
import { BestieDmTodosSheet } from "./BestieDmTodosSheet";
import { BESTIE_COFFEE_BREW_EVENT } from "./bestieCoffeeSchedule";
import {
  beginBestieCoffeeRunForScope,
  useBestieCoffee,
} from "./bestieCoffeeStore";
import {
  bestieCategoryTitle,
  bestieIdleAuxiliaryKind,
  type BestieRhsKind,
} from "./bestieDmRhsHelpers";
import { setBestieViewingDm } from "./bestieAttentionStore";
import { useBestieAssignmentQuery } from "./useBestie";
import type { Channel } from "@/shared/api/types";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { ChannelScreenProps } from "@/features/channels/ui/ChannelScreen.types";
import type { IdleAuxiliaryHeaderControls } from "@/features/channels/ui/IdleAuxiliaryPanel";
import { useFeatureEnabled } from "@/shared/features";
import { normalizePubkey } from "@/shared/lib/pubkey";

type BestieChannelScreenExtras = Pick<
  ChannelScreenProps,
  | "headerEndActions"
  | "idleAuxiliaryPanel"
  | "idleAuxiliaryTitle"
  | "idleAuxiliaryOverridesThread"
  | "idleAuxiliaryHeaderActions"
  | "onCloseIdleAuxiliaryPanel"
>;

export type BestieChannelExtras = BestieChannelScreenExtras & {
  /**
   * Fixed RHS category rows (Reminders / To-dos). Rendered outside
   * ChannelScreen in {@link BestieDmChannelFrame} — never inside idleAuxiliary.
   */
  contextColumn: React.ReactNode | null;
  contextColumnOpen: boolean;
};

/**
 * When the active channel is the Bestie DM, attach project-home-style RHS:
 * fixed category rows in the native right column; idleAuxiliary slide only
 * when drilling into a category’s items (+ add). Empty otherwise (and always
 * when Bestie is disabled).
 */
export function useBestieDmChannelExtras(
  activeChannel: Channel | null | undefined,
): BestieChannelExtras {
  const enabled = useFeatureEnabled("bestie");
  const { assignmentQuery, ownerPubkey, relayUrl } =
    useBestieAssignmentQuery(enabled);
  const [panelOpen, setPanelOpen] = React.useState(true);
  const [activeKind, setActiveKind] = React.useState<BestieRhsKind | null>(
    null,
  );
  const [adding, setAdding] = React.useState(false);

  const bestiePubkey = assignmentQuery.data?.agentPubkey ?? null;
  const isBestieDm = React.useMemo(() => {
    if (!enabled || !activeChannel || !ownerPubkey || !bestiePubkey) {
      return false;
    }
    const found = findBestieDmChannel(
      [activeChannel],
      ownerPubkey,
      bestiePubkey,
    );
    return found?.id === activeChannel.id;
  }, [activeChannel, bestiePubkey, enabled, ownerPubkey]);

  // Re-open fixed RHS (category list) when navigating into the Bestie DM.
  React.useEffect(() => {
    if (isBestieDm) {
      setPanelOpen(true);
      setActiveKind(null);
      setAdding(false);
    }
  }, [isBestieDm]);

  const scope = React.useMemo(() => {
    if (!relayUrl || !ownerPubkey || !bestiePubkey) return null;
    return {
      agentPubkey: normalizePubkey(bestiePubkey),
      ownerPubkey: normalizePubkey(ownerPubkey),
      relayUrl,
    };
  }, [bestiePubkey, ownerPubkey, relayUrl]);

  // Footer unread clears while the Bestie DM thread is the active view.
  React.useEffect(() => {
    setBestieViewingDm(isBestieDm);
    return () => setBestieViewingDm(false);
  }, [isBestieDm]);

  const openKind = React.useCallback((kind: BestieRhsKind) => {
    setAdding(false);
    setActiveKind((current) => (current === kind ? null : kind));
  }, []);

  const onCloseIdleAuxiliaryPanel = React.useCallback(() => {
    // Slide close → back to fixed category list (column stays open).
    setActiveKind(null);
    setAdding(false);
  }, []);

  const headerToggle = React.useMemo(() => {
    if (!isBestieDm) return null;
    const label = panelOpen ? "Hide Bestie list" : "Show Bestie list";
    return (
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>
          <Button
            aria-label={label}
            aria-pressed={panelOpen}
            className="shrink-0"
            data-testid="bestie-dm-rhs-toggle"
            onClick={() => {
              setPanelOpen((open) => {
                if (open) {
                  setActiveKind(null);
                  setAdding(false);
                }
                return !open;
              });
            }}
            size="icon"
            title={label}
            type="button"
            variant={panelOpen ? "secondary" : "ghost"}
          >
            <ListTodo />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }, [isBestieDm, panelOpen]);

  const contextColumn = React.useMemo(() => {
    if (!scope) return null;
    return (
      <BestieDmRhsPanel
        activeKind={activeKind}
        onOpenKind={openKind}
        scope={scope}
      />
    );
  }, [activeKind, openKind, scope]);

  const coffeeState = useBestieCoffee(scope);
  const requestCoffeeBrew = React.useCallback(() => {
    if (!scope) return;
    const begun = beginBestieCoffeeRunForScope(scope, "brew");
    if (!begun) return;
    window.dispatchEvent(
      new CustomEvent(BESTIE_COFFEE_BREW_EVENT, {
        detail: { agentPubkey: scope.agentPubkey },
      }),
    );
  }, [scope]);

  const idleAuxiliaryPanel = React.useMemo(() => {
    if (!scope || activeKind == null) return null;
    if (activeKind === "job") {
      return (
        <BestieDmJobsSheet
          adding={adding}
          onRequestAdd={() => setAdding(true)}
          scope={scope}
        />
      );
    }
    if (activeKind === "coffee") {
      return (
        <BestieDmCoffeeSheet
          brewing={coffeeState.pendingRun != null}
          onBrew={requestCoffeeBrew}
          scope={scope}
        />
      );
    }
    if (activeKind === "thread") {
      return <BestieDmThreadsSheet scope={scope} />;
    }
    if (activeKind === "scratch") {
      return (
        <BestieDmScratchSheet
          adding={adding}
          onRequestAdd={() => setAdding(true)}
          scope={scope}
        />
      );
    }
    if (activeKind === "todo") {
      return (
        <BestieDmTodosSheet
          adding={adding}
          onRequestAdd={() => setAdding(true)}
          scope={scope}
        />
      );
    }
    return (
      <BestieDmCategorySheet
        adding={adding}
        kind={activeKind}
        onRequestAdd={() => setAdding(true)}
        scope={scope}
      />
    );
  }, [activeKind, adding, coffeeState.pendingRun, requestCoffeeBrew, scope]);

  const idleAuxiliaryHeaderActions =
    React.useMemo<IdleAuxiliaryHeaderControls | null>(() => {
      if (activeKind == null) return null;
      const back = {
        backLabel: "Back to Bestie list",
        onBack: () => {
          setActiveKind(null);
          setAdding(false);
        },
      };
      if (activeKind === "coffee" || activeKind === "thread") {
        return { ...back };
      }
      const addLabel =
        activeKind === "reminder"
          ? "Add reminder"
          : activeKind === "todo"
            ? "Add to-do"
            : activeKind === "scratch"
              ? "Add scratch note"
              : "Add job";
      return {
        ...back,
        actions: (
          <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>
              <Button
                aria-label={addLabel}
                aria-pressed={adding}
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                data-testid="bestie-dm-category-sheet-create"
                onClick={() => setAdding((value) => !value)}
                size="icon"
                title={addLabel}
                type="button"
                variant={adding ? "secondary" : "ghost"}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{addLabel}</TooltipContent>
          </Tooltip>
        ),
      };
    }, [activeKind, adding]);

  return React.useMemo(() => {
    if (!enabled || !isBestieDm || !scope) {
      return {
        contextColumn: null,
        contextColumnOpen: false,
      };
    }

    const screenExtras: BestieChannelScreenExtras = {
      headerEndActions: headerToggle,
    };

    // Slide only when drilling into a category — never for the category list.
    const drillKind = bestieIdleAuxiliaryKind(activeKind);
    if (panelOpen && drillKind != null && idleAuxiliaryPanel) {
      screenExtras.idleAuxiliaryHeaderActions =
        idleAuxiliaryHeaderActions ?? undefined;
      screenExtras.idleAuxiliaryOverridesThread = true;
      screenExtras.idleAuxiliaryPanel = idleAuxiliaryPanel;
      screenExtras.idleAuxiliaryTitle = bestieCategoryTitle(drillKind);
      screenExtras.onCloseIdleAuxiliaryPanel = onCloseIdleAuxiliaryPanel;
    }

    return {
      ...screenExtras,
      contextColumn,
      contextColumnOpen: panelOpen,
    };
  }, [
    activeKind,
    contextColumn,
    enabled,
    headerToggle,
    idleAuxiliaryHeaderActions,
    idleAuxiliaryPanel,
    isBestieDm,
    onCloseIdleAuxiliaryPanel,
    panelOpen,
    scope,
  ]);
}
