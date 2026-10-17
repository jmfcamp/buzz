// Web: choosing "your Assistant". The desktop keeps the one Assistant assignment (a desktop-local setting), so the web
// changes it over Direct like every other agent action, then mirrors it into the synced pick (assistantPick.ts) that
// all your web/phone sessions read. Without Direct the choice is shown but can't be changed.
import * as React from "react";
import { toast } from "sonner";

import { isCmdStale } from "@/features/bridge/remoteCmd";
import {
  DIRECT_CONTROLS_HINT,
  useDesktopData,
} from "@/features/bridge/ui/DesktopData";
import { useCommunities } from "@/features/communities/useCommunities";
import { setSyncedAssistant } from "@/features/inbox/assistantPick";
import { useIdentityQuery } from "@/shared/api/hooks";
import { invokeTauri } from "@/shared/api/tauri";

export const ASSISTANT_NEEDS_DESKTOP_UPDATE =
  "Your desktop needs the next Hula Buzz update to change the Assistant from the web.";

export function useWebAssistantChoice() {
  const me = useIdentityQuery().data?.pubkey?.toLowerCase();
  const relayUrl = useCommunities().activeCommunity?.relayUrl ?? null;
  const { web, live } = useDesktopData();
  const [pending, setPending] = React.useState(false);
  const needsUpdate = web && isCmdStale("assign_bestie");
  const disabledReason = !web
    ? null
    : !live
      ? DIRECT_CONTROLS_HINT
      : needsUpdate
        ? ASSISTANT_NEEDS_DESKTOP_UPDATE
        : null;

  const choose = React.useCallback(
    async (agentPubkey: string | null, name?: string) => {
      if (!me || !relayUrl) {
        toast.error("Open a community first.");
        return false;
      }
      setPending(true);
      try {
        const scope = { expectedRelayUrl: relayUrl, expectedSignerPubkey: me };
        if (agentPubkey) {
          const r = await invokeTauri<{ agent_pubkey?: string } | null>(
            "assign_bestie",
            { agentPubkey: agentPubkey.toLowerCase(), ...scope },
          );
          setSyncedAssistant(me, r?.agent_pubkey ?? agentPubkey);
          toast.success(`${name ?? "That agent"} is now your Assistant.`);
        } else {
          await invokeTauri("clear_bestie_assignment", scope);
          setSyncedAssistant(me, null);
          toast.success("Assistant removed.");
        }
        return true;
      } catch (e) {
        toast.error(
          isCmdStale(agentPubkey ? "assign_bestie" : "clear_bestie_assignment")
            ? ASSISTANT_NEEDS_DESKTOP_UPDATE
            : e instanceof Error
              ? e.message
              : "Couldn't change the Assistant.",
        );
        return false;
      } finally {
        setPending(false);
      }
    },
    [me, relayUrl],
  );

  return {
    choose,
    disabled: pending || disabledReason !== null,
    disabledReason,
    live,
    needsUpdate,
    pending,
    web,
  };
}
