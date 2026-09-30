import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { buildTranscriptState } from "@/features/agents/ui/agentSessionTranscript";
import {
  mergeObserverEventWindows,
  scopeByChannel,
} from "@/features/agents/ui/agentSessionPanelLayout";
import type {
  ObserverEvent,
  TranscriptItem,
} from "@/features/agents/ui/agentSessionTypes";
import {
  useArchivedChannelEvents,
  useLoadArchivedObserverEvents,
  useObserverEvents,
} from "@/features/agents/ui/useObserverEvents";
import {
  collectThinkingContentItems,
  findNearestTurnIdByTime,
  findTurnIdForPromptEvent,
  formatTurnDuration,
  formatTurnTokens,
  summarizeThinkingItems,
} from "@/features/messages/lib/agentMessageTurnMeta";
import { useShowAgentThinking } from "@/features/messages/lib/showAgentThinkingPreference";
import {
  getAgentTurnMetricNear,
  type AgentTurnMetricNear,
} from "@/shared/api/tauriArchive";
import { getEventById } from "@/shared/api/tauriEvents";
import { normalizePubkey } from "@/shared/lib/pubkey";

export type AgentMessageTurnMeta = {
  enabled: boolean;
  durationLabel: string | null;
  durationSeconds: number | null;
  tokensLabel: string | null;
  totalTokens: string | null;
  metric: AgentTurnMetricNear | null;
  turnId: string | null;
  /** Thought + tool items only (never lifecycle-only filler). */
  turnItems: TranscriptItem[];
  thoughtCount: number;
  toolCount: number;
  thoughtPreview: string | null;
  hasThinkingContent: boolean;
  joinMethod: "triggering-event" | "time-proximity" | "none";
  metricLoading: boolean;
  durationLoading: boolean;
  thinkingLoading: boolean;
};

/**
 * Best-available join of duration / tokens / thinking for one agent reply.
 *
 * - Duration: parent prompt `created_at` → reply `created_at` (via `parentId`)
 * - Tokens: nearest archived 44200 metric by `reported_at` (±3m window)
 * - Thinking: observer frames for agent+channel; prefer turn whose
 *   `triggeringEventIds` includes `parentId`, else nearest by time that has
 *   thought/tool content. Includes null-turnId chunks in the prompt→reply window.
 */
export function useAgentMessageTurnMeta(input: {
  agentPubkey: string | null | undefined;
  channelId: string | null | undefined;
  messageId: string;
  createdAt: number;
  parentId: string | null | undefined;
  isAgent: boolean;
}): AgentMessageTurnMeta {
  const showThinking = useShowAgentThinking();
  const enabled =
    showThinking &&
    input.isAgent &&
    Boolean(input.agentPubkey) &&
    !Number.isNaN(input.createdAt);

  const agentPubkey = input.agentPubkey
    ? normalizePubkey(input.agentPubkey)
    : null;

  const parentQuery = useQuery({
    queryKey: ["agent-message-parent", input.parentId ?? null],
    enabled: enabled && Boolean(input.parentId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!input.parentId) return null;
      try {
        return await getEventById(input.parentId);
      } catch {
        return null;
      }
    },
  });

  const metricQuery = useQuery({
    queryKey: ["agent-turn-metric-near", agentPubkey, input.createdAt] as const,
    enabled: enabled && Boolean(agentPubkey),
    staleTime: 30_000,
    queryFn: async () => {
      if (!agentPubkey) return null;
      return getAgentTurnMetricNear({
        agentPubkey,
        aroundSec: input.createdAt,
        windowSec: 180,
      });
    },
  });

  // Live observer frames (cheap; already subscribed for running / community bots).
  const { events: liveEvents } = useObserverEvents(
    enabled && Boolean(agentPubkey),
    agentPubkey,
  );

  // Eager archive hydrate so Thought chip visibility and expand content are
  // available without waiting for the user to open the card. Same path the
  // activity pane uses (owner_p 24200 → channel index → decrypt → store).
  const { hasOlderArchived } = useLoadArchivedObserverEvents(
    enabled && Boolean(input.channelId),
    input.channelId ?? null,
  );

  const archivedEvents = useArchivedChannelEvents(
    agentPubkey,
    input.channelId ?? null,
  );

  const combinedEvents = React.useMemo(() => {
    if (!enabled || !agentPubkey) return [] as ObserverEvent[];
    const scopedLive = scopeByChannel(liveEvents, input.channelId ?? null);
    // Frames with null channelId are dropped by scopeByChannel. Re-include
    // recent null-channel frames from live so early turn chunks still join.
    const nullChannelLive =
      input.channelId != null
        ? liveEvents.filter((event) => {
            if (event.channelId != null) return false;
            if (!event.timestamp) return false;
            const ts = Date.parse(event.timestamp);
            if (!Number.isFinite(ts)) return false;
            return Math.abs(ts / 1000 - input.createdAt) <= 600;
          })
        : [];
    return mergeObserverEventWindows(
      [...scopedLive, ...nullChannelLive],
      archivedEvents,
    );
  }, [
    enabled,
    agentPubkey,
    liveEvents,
    archivedEvents,
    input.channelId,
    input.createdAt,
  ]);

  const transcriptItems = React.useMemo(
    () => buildTranscriptState(combinedEvents).items,
    [combinedEvents],
  );

  const parentCreatedAt =
    typeof parentQuery.data?.created_at === "number"
      ? parentQuery.data.created_at
      : null;

  const { turnId, joinMethod } = React.useMemo(() => {
    const byTrigger = findTurnIdForPromptEvent(combinedEvents, input.parentId);
    if (byTrigger) {
      return { turnId: byTrigger, joinMethod: "triggering-event" as const };
    }
    const byTime = findNearestTurnIdByTime(transcriptItems, input.createdAt);
    if (byTime) {
      return { turnId: byTime, joinMethod: "time-proximity" as const };
    }
    return { turnId: null, joinMethod: "none" as const };
  }, [combinedEvents, transcriptItems, input.parentId, input.createdAt]);

  const turnItems = React.useMemo(
    () =>
      collectThinkingContentItems(transcriptItems, {
        turnId,
        windowStartSec: parentCreatedAt,
        windowEndSec: input.createdAt,
      }),
    [transcriptItems, turnId, parentCreatedAt, input.createdAt],
  );

  const thinkingSummary = React.useMemo(
    () => summarizeThinkingItems(turnItems),
    [turnItems],
  );

  const hasThinkingContent =
    thinkingSummary.thoughtCount > 0 || thinkingSummary.toolCount > 0;

  const durationSeconds = React.useMemo(() => {
    if (parentCreatedAt != null && parentCreatedAt > 0) {
      return Math.max(0, input.createdAt - parentCreatedAt);
    }
    const startEvent = combinedEvents.find(
      (e) => e.kind === "turn_started" && e.turnId === turnId,
    );
    if (startEvent?.timestamp) {
      const startMs = Date.parse(startEvent.timestamp);
      if (Number.isFinite(startMs)) {
        return Math.max(0, input.createdAt - Math.floor(startMs / 1000));
      }
    }
    return null;
  }, [parentCreatedAt, input.createdAt, combinedEvents, turnId]);

  const metric = metricQuery.data ?? null;
  const totalTokens =
    metric?.turnTotalTokens ??
    (metric?.turnInputTokens && metric?.turnOutputTokens
      ? sumTokenStrings(metric.turnInputTokens, metric.turnOutputTokens)
      : (metric?.turnOutputTokens ?? metric?.turnInputTokens ?? null));

  // Archive still paging and we have no thinking yet → treat as loading so
  // the UI does not flash an empty Thought chip / card.
  const thinkingLoading =
    Boolean(input.channelId) &&
    hasOlderArchived !== false &&
    !hasThinkingContent &&
    combinedEvents.length === 0;

  return {
    enabled,
    durationLabel: formatTurnDuration(durationSeconds),
    durationSeconds,
    tokensLabel: formatTurnTokens(totalTokens),
    totalTokens,
    metric,
    turnId,
    turnItems,
    thoughtCount: thinkingSummary.thoughtCount,
    toolCount: thinkingSummary.toolCount,
    thoughtPreview: thinkingSummary.thoughtPreview,
    hasThinkingContent,
    joinMethod,
    metricLoading: metricQuery.isLoading,
    durationLoading: Boolean(input.parentId) && parentQuery.isLoading,
    thinkingLoading,
  };
}

function sumTokenStrings(a: string, b: string): string | null {
  try {
    return (BigInt(a) + BigInt(b)).toString();
  } catch {
    return null;
  }
}
