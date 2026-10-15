import * as React from "react";
import { useQuery } from "@tanstack/react-query";

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
  collectTurnPromptContext,
  earliestContentStartedAtSec,
  extractTriggeringEventIds,
  findNearestTurnIdByTime,
  findTurnIdForPromptEvent,
  findTurnStartedEvent,
  findTurnUsageUsedFromTranscript,
  findTurnUsageUsedTokens,
  formatTurnDuration,
  formatTurnTokens,
  normalizeUnixSeconds,
  resolveReplyChipTokenCount,
  resolveTurnDurationSeconds,
  selectPromptCreatedAtForDuration,
  summarizeThinkingItems,
} from "@/features/messages/lib/agentMessageTurnMeta";
import {
  isHydrationLeader,
  joinHydration,
  leaveHydration,
  publishHasOlderArchived,
  readSharedHasOlderArchived,
  resolveTurnMetaTranscript,
  subscribeHydration,
} from "@/features/messages/lib/turnMetaShared";
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
  totalTokens: string | number | null;
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
  /** Sections for the shared Prompt context dialog (activity-feed CheckCheck). */
  promptContextSections: Array<{ title: string; body: string }>;
  promptSetupItems: TranscriptItem[];
  hasPromptContext: boolean;
};

/**
 * Best-available join of duration / tokens / thinking for one agent reply.
 *
 * - Duration: triggering prompt / turn_started → reply (not stale parentId)
 * - Tokens: prefer this turn's ACP `usage_update.used` (same numerator as the
 *   channel Usage Tokens line). Else archived 44200 on exact session/turn only
 *   — never a time-near hit, which rewrote every nearby reply to the latest
 *   session total as usage frames streamed.
 * - Thinking: observer frames for agent+channel; prefer turn whose
 *   `triggeringEventIds` includes `parentId`, else nearest by time that has
 *   thought/tool content. Includes null-turnId chunks in the prompt→reply window.
 */
const EMPTY_EVENTS: ObserverEvent[] = [];
const EMPTY_ITEMS: TranscriptItem[] = [];

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

  // Live observer frames (cheap; already subscribed for running / community bots).
  const { events: liveEvents } = useObserverEvents(
    enabled && Boolean(agentPubkey),
    agentPubkey,
  );

  // Eager archive hydrate so Thought chip visibility and expand content are
  // available without waiting for the user to open the card. Same path the
  // activity pane uses (owner_p 24200 → channel index → decrypt → store).
  // One row per channel hydrates (the leader); every other reply reads the
  // shared archive store. Previously each agent reply ran its own backfill +
  // 10-page archive ingest for the same channel.
  const hydrationChannelId =
    enabled && input.channelId ? input.channelId : null;
  const memberId = React.useId();
  React.useEffect(() => {
    if (!hydrationChannelId) return;
    joinHydration(hydrationChannelId, memberId);
    return () => leaveHydration(hydrationChannelId, memberId);
  }, [hydrationChannelId, memberId]);
  const subscribeLeader = React.useCallback(
    (listener: () => void) => subscribeHydration(hydrationChannelId, listener),
    [hydrationChannelId],
  );
  const isLeader = React.useSyncExternalStore(subscribeLeader, () =>
    isHydrationLeader(hydrationChannelId, memberId),
  );
  const sharedHasOlderArchived = React.useSyncExternalStore(
    subscribeLeader,
    () => readSharedHasOlderArchived(hydrationChannelId),
  );
  const { hasOlderArchived: leaderHasOlderArchived } =
    useLoadArchivedObserverEvents(isLeader, input.channelId ?? null);
  React.useEffect(() => {
    if (isLeader && hydrationChannelId) {
      publishHasOlderArchived(hydrationChannelId, leaderHasOlderArchived);
    }
  }, [isLeader, hydrationChannelId, leaderHasOlderArchived]);
  const hasOlderArchived = isLeader
    ? leaderHasOlderArchived
    : sharedHasOlderArchived;

  const archivedEvents = useArchivedChannelEvents(
    agentPubkey,
    input.channelId ?? null,
  );

  // Rows with the same live/archived inputs share one merge + transcript build
  // (see turnMetaShared). Rebuilding per reply was O(replies × frames) on
  // every streamed observer frame.
  const sharedTranscript = React.useMemo(() => {
    if (!enabled || !agentPubkey) return null;
    return resolveTurnMetaTranscript(
      liveEvents,
      archivedEvents,
      input.channelId ?? null,
      input.createdAt,
    );
  }, [
    enabled,
    agentPubkey,
    liveEvents,
    archivedEvents,
    input.channelId,
    input.createdAt,
  ]);
  const combinedEvents: ObserverEvent[] =
    sharedTranscript?.combined ?? EMPTY_EVENTS;
  const transcriptItems: TranscriptItem[] =
    sharedTranscript?.items ?? EMPTY_ITEMS;

  const { turnId, sessionId, joinMethod, turnStarted } = React.useMemo(() => {
    const byTrigger = findTurnIdForPromptEvent(combinedEvents, input.parentId);
    if (byTrigger) {
      const started = findTurnStartedEvent(combinedEvents, byTrigger);
      return {
        turnId: byTrigger,
        sessionId: started?.sessionId ?? null,
        joinMethod: "triggering-event" as const,
        turnStarted: started,
      };
    }
    const byTime = findNearestTurnIdByTime(transcriptItems, input.createdAt);
    if (byTime) {
      const started = findTurnStartedEvent(combinedEvents, byTime);
      return {
        turnId: byTime,
        sessionId: started?.sessionId ?? null,
        joinMethod: "time-proximity" as const,
        turnStarted: started,
      };
    }
    return {
      turnId: null,
      sessionId: null,
      joinMethod: "none" as const,
      turnStarted: null,
    };
  }, [combinedEvents, transcriptItems, input.parentId, input.createdAt]);

  // Prefer exact session+turn on 44200; fall back to tight time only.
  const metricQuery = useQuery({
    queryKey: [
      "agent-turn-metric-near",
      agentPubkey,
      input.createdAt,
      sessionId,
      turnId,
    ] as const,
    enabled: enabled && Boolean(agentPubkey),
    staleTime: 30_000,
    queryFn: async () => {
      if (!agentPubkey) return null;
      return getAgentTurnMetricNear({
        agentPubkey,
        aroundSec: input.createdAt,
        windowSec: 180,
        sessionId,
        turnId,
      });
    },
  });

  // Actual harness prompt id for this turn (not necessarily message.parentId —
  // parentId may be an older thread ancestor and inflated duration).
  const triggerPromptId = React.useMemo(() => {
    if (!turnStarted) return null;
    const ids = extractTriggeringEventIds(turnStarted.payload);
    return ids[0] ?? null;
  }, [turnStarted]);

  const promptEventId =
    triggerPromptId ??
    (joinMethod === "triggering-event" ? (input.parentId ?? null) : null);

  const promptQuery = useQuery({
    queryKey: ["agent-message-turn-prompt", promptEventId],
    enabled: enabled && Boolean(promptEventId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!promptEventId) return null;
      try {
        return await getEventById(promptEventId);
      } catch {
        return null;
      }
    },
  });

  // Parent is only a duration fallback when it is the trigger (or we have no
  // turn_started). Still fetched for thinking window bounds.
  const parentCreatedAt = normalizeUnixSeconds(parentQuery.data?.created_at);
  const promptCreatedAt = normalizeUnixSeconds(promptQuery.data?.created_at);

  const turnStartedAtSec = React.useMemo(() => {
    if (!turnStarted?.timestamp) return null;
    const ms = Date.parse(turnStarted.timestamp);
    if (!Number.isFinite(ms)) return null;
    return Math.floor(ms / 1000);
  }, [turnStarted]);

  // Window for collecting thinking: prefer prompt/turn start, not an old parent.
  const thinkingWindowStartSec =
    promptCreatedAt ?? turnStartedAtSec ?? parentCreatedAt;

  const turnItems = React.useMemo(
    () =>
      collectThinkingContentItems(transcriptItems, {
        turnId,
        windowStartSec: thinkingWindowStartSec,
        windowEndSec: input.createdAt,
      }),
    [transcriptItems, turnId, thinkingWindowStartSec, input.createdAt],
  );

  const thinkingSummary = React.useMemo(
    () => summarizeThinkingItems(turnItems),
    [turnItems],
  );

  const hasThinkingContent =
    thinkingSummary.thoughtCount > 0 || thinkingSummary.toolCount > 0;

  const promptContext = React.useMemo(
    () =>
      collectTurnPromptContext(transcriptItems, {
        turnId,
        windowStartSec: thinkingWindowStartSec,
        windowEndSec: input.createdAt,
      }),
    [transcriptItems, turnId, thinkingWindowStartSec, input.createdAt],
  );

  const contentStartedAtSec = React.useMemo(
    () => earliestContentStartedAtSec(turnItems),
    [turnItems],
  );

  const durationSeconds = React.useMemo(() => {
    // Prefer harness trigger / turn_started / thinking start. Never fall back
    // to message.parentId unless the join proved it is the trigger — community
    // bots parent to thread ancestors and that produced multi-hour chips when
    // turn_started was missing (#179 still allowed parent when started==null).
    const promptForDuration = selectPromptCreatedAtForDuration({
      joinMethod,
      promptCreatedAtSec: promptCreatedAt,
      parentCreatedAtSec: parentCreatedAt,
    });

    return resolveTurnDurationSeconds({
      replyCreatedAt: input.createdAt,
      turnStartedAtSec,
      promptCreatedAtSec: promptForDuration,
      contentStartedAtSec,
    });
  }, [
    input.createdAt,
    promptCreatedAt,
    parentCreatedAt,
    turnStartedAtSec,
    contentStartedAtSec,
    joinMethod,
  ]);

  const metric = metricQuery.data ?? null;
  // Pin to this turn's Usage numerator when present so later turns cannot
  // rewrite older chips via a shared time-near 44200 hit.
  const usageUsedTokens = React.useMemo(() => {
    const fromEvents = findTurnUsageUsedTokens(combinedEvents, turnId);
    if (fromEvents != null) return fromEvents;
    // Progress/mid-turn replies can miss usage_update frames in the observer
    // window while the coalesced Usage lifecycle row still has Tokens: used/size.
    return findTurnUsageUsedFromTranscript(transcriptItems, turnId);
  }, [combinedEvents, turnId, transcriptItems]);
  const totalTokens = resolveReplyChipTokenCount({
    usageUsedTokens,
    metricMatchKind: metric?.matchKind,
    metricTurnTotalTokens: metric?.turnTotalTokens,
    metricTurnInputTokens: metric?.turnInputTokens,
    metricTurnOutputTokens: metric?.turnOutputTokens,
  });

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
    metricLoading: usageUsedTokens == null && metricQuery.isLoading,
    durationLoading:
      (Boolean(promptEventId) && promptQuery.isLoading) ||
      (Boolean(input.parentId) && !promptEventId && parentQuery.isLoading),
    thinkingLoading,
    promptContextSections: promptContext.sections,
    promptSetupItems: promptContext.setup,
    hasPromptContext: promptContext.hasContext,
  };
}
