import * as React from "react";

import { usePersonalPinsSync } from "@/features/pinned-sites/hooks";
import { currentPopoutPayload } from "@/features/popout/lib/popoutWindow";

import { startAssistantListsSync } from "@/features/assistantLists/listsSync";
import { startAssistantRoutinesSync } from "@/features/assistantRoutines/routinesSync";
import { useCommunities } from "@/features/communities/useCommunities";
import { startThreadLabelsSync } from "@/features/sidebar/lib/threadLabelsSync";

import { startInboxStateSync } from "./inboxStateSync";

/**
 * Mount once per main window (AppShell remounts per community, so this
 * re-bootstraps against each community relay). Popout windows never sync.
 */
export function useInboxStateSync(
  pubkey: string | undefined,
  enabled: boolean,
) {
  const isPopout = React.useMemo(() => currentPopoutPayload() != null, []);
  // Personal pinned sites ride the same main-window, per-community lifecycle.
  usePersonalPinsSync(enabled && !isPopout);
  React.useEffect(() => {
    if (!enabled || isPopout || !pubkey) return;
    return startInboxStateSync(pubkey);
  }, [enabled, isPopout, pubkey]);
  // Assistant lists (to-dos + reminders) ride the same lifecycle: one synced doc per owner on the community relay.
  const relayUrl = useCommunities().activeCommunity?.relayUrl ?? "";
  React.useEffect(() => {
    if (!enabled || isPopout || !pubkey || !relayUrl) return;
    return startAssistantListsSync(pubkey, relayUrl);
  }, [enabled, isPopout, pubkey, relayUrl]);
  // Assistant routines: same lifecycle, own d-tag (buzz:assistant-routines).
  React.useEffect(() => {
    if (!enabled || isPopout || !pubkey || !relayUrl) return;
    return startAssistantRoutinesSync(pubkey, relayUrl);
  }, [enabled, isPopout, pubkey, relayUrl]);
  // Personal thread titles/icons: kind 30078 d=buzz:thread-labels, same lifecycle.
  // Surface-tabs (open tab strip) stay on their own d-tag and are not touched here.
  React.useEffect(() => {
    if (!enabled || isPopout || !pubkey || !relayUrl) return;
    return startThreadLabelsSync(pubkey, relayUrl);
  }, [enabled, isPopout, pubkey, relayUrl]);
}
