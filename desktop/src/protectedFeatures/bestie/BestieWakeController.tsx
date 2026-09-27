import * as React from "react";

import { useChannelsQuery } from "@/features/channels/hooks";
import { useChannelMessagesQuery } from "@/features/messages/hooks";
import { useIdentityQuery } from "@/shared/api/hooks";
import { normalizePubkey } from "@/shared/lib/pubkey";
import {
  applyBestieListActionsFromAgentMessage,
  getBestieListState,
  useBestieList,
} from "./bestieListStore";
import {
  clearBestieNudge,
  getBestieNudge,
  setBestieNudge,
} from "./bestieNudgeStore";
import { findBestieDmChannel } from "./filterBestieDmChannels";
import {
  BESTIE_WAKE_INTERVAL_MS,
  startBestieWakeScheduler,
} from "./bestieWakeScheduler";
import { useBestie } from "./useBestie";

/**
 * Mounts the ~5 min autonomous wake loop and watches Bestie DM messages for
 * structured list actions from the agent.
 */
export function BestieWakeController() {
  const bestie = useBestie();
  const identityQuery = useIdentityQuery();
  const channelsQuery = useChannelsQuery();
  const ownerPubkey = identityQuery.data?.pubkey ?? "";
  const agentPubkey = bestie.assignedAgent?.pubkey ?? "";
  const relayUrl = bestie.relayUrl ?? "";

  const bestieChannel = React.useMemo(
    () =>
      findBestieDmChannel(
        channelsQuery.data ?? [],
        ownerPubkey,
        agentPubkey || null,
      ),
    [agentPubkey, channelsQuery.data, ownerPubkey],
  );

  const messagesQuery = useChannelMessagesQuery(bestieChannel);

  const listScope = React.useMemo(() => {
    if (!relayUrl || !ownerPubkey || !agentPubkey) return null;
    return {
      agentPubkey: normalizePubkey(agentPubkey),
      ownerPubkey: normalizePubkey(ownerPubkey),
      relayUrl,
    };
  }, [agentPubkey, ownerPubkey, relayUrl]);

  const listState = useBestieList(listScope);
  const ensureAgentRunningRef = React.useRef(bestie.ensureAgentRunning);
  ensureAgentRunningRef.current = bestie.ensureAgentRunning;

  // Agent-add path: apply structured bestie-list fences from Bestie agent msgs.
  React.useEffect(() => {
    if (!listScope || !bestieChannel || !agentPubkey) return;
    const agentNorm = normalizePubkey(agentPubkey);
    const events = messagesQuery.data ?? [];
    for (const event of events) {
      if (normalizePubkey(event.pubkey) !== agentNorm) continue;
      if (typeof event.content !== "string" || event.content.length === 0) {
        continue;
      }
      applyBestieListActionsFromAgentMessage(
        listScope,
        event.id,
        event.content,
      );
    }
  }, [agentPubkey, bestieChannel, listScope, messagesQuery.data]);

  // Autonomous wake + proactive nudge (footer / popover), ~5 min.
  // Depend on listScope only — useBestie() returns a new object every render.
  React.useEffect(() => {
    if (!listScope) return;
    const handles = startBestieWakeScheduler({
      getListState: () => getBestieListState(listScope),
      getPreviousNudgeId: () => getBestieNudge()?.id ?? null,
      intervalMs: BESTIE_WAKE_INTERVAL_MS,
      onNudge: (nudge) => setBestieNudge(nudge),
      onWakeAgent: () => {
        void ensureAgentRunningRef.current().catch(() => {
          // Best-effort wake.
        });
      },
    });
    return () => {
      handles.stop();
    };
  }, [listScope]);

  // Clear stale nudge when the outstanding set is emptied.
  React.useEffect(() => {
    const nudge = getBestieNudge();
    if (!nudge) return;
    const stillOpen = nudge.itemIds.some((id) =>
      listState.items.some((item) => item.id === id && item.status === "open"),
    );
    if (!stillOpen) clearBestieNudge();
  }, [listState]);

  return null;
}
