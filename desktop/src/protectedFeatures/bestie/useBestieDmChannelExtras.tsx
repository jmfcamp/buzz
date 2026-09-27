import { ListTodo } from "lucide-react";
import * as React from "react";

import { findBestieDmChannel } from "./filterBestieDmChannels";
import { BestieDmRhsPanel } from "./BestieDmRhsPanel";
import { useBestieAssignmentQuery } from "./useBestie";
import type { Channel } from "@/shared/api/types";
import { Button } from "@/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import type { ChannelScreenProps } from "@/features/channels/ui/ChannelScreen.types";
import { useFeatureEnabled } from "@/shared/features";
import { normalizePubkey } from "@/shared/lib/pubkey";

type BestieChannelExtras = Pick<
  ChannelScreenProps,
  | "headerEndActions"
  | "idleAuxiliaryPanel"
  | "idleAuxiliaryTitle"
  | "idleAuxiliaryOverridesThread"
  | "onCloseIdleAuxiliaryPanel"
>;

/**
 * When the active channel is the Bestie DM, attach a project-like RHS for
 * reminders / to-dos. Returns empty props otherwise (and always when Bestie
 * is disabled).
 */
export function useBestieDmChannelExtras(
  activeChannel: Channel | null | undefined,
): BestieChannelExtras {
  const enabled = useFeatureEnabled("bestie");
  const { assignmentQuery, ownerPubkey, relayUrl } =
    useBestieAssignmentQuery(enabled);
  const [panelOpen, setPanelOpen] = React.useState(true);

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

  // Re-open RHS when navigating into the Bestie DM.
  React.useEffect(() => {
    if (isBestieDm) setPanelOpen(true);
  }, [isBestieDm]);

  const scope = React.useMemo(() => {
    if (!relayUrl || !ownerPubkey || !bestiePubkey) return null;
    return {
      agentPubkey: normalizePubkey(bestiePubkey),
      ownerPubkey: normalizePubkey(ownerPubkey),
      relayUrl,
    };
  }, [bestiePubkey, ownerPubkey, relayUrl]);

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
            onClick={() => setPanelOpen((open) => !open)}
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

  if (!enabled || !isBestieDm || !scope) {
    return {};
  }

  if (!panelOpen) {
    return {
      headerEndActions: headerToggle,
    };
  }

  return {
    headerEndActions: headerToggle,
    idleAuxiliaryOverridesThread: true,
    idleAuxiliaryPanel: <BestieDmRhsPanel scope={scope} />,
    idleAuxiliaryTitle: "Bestie",
    onCloseIdleAuxiliaryPanel: () => setPanelOpen(false),
  };
}
