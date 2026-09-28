import * as React from "react";

import { useChannelsQuery } from "@/features/channels/hooks";
import {
  useChannelMessagesQuery,
  useSendMessageMutation,
} from "@/features/messages/hooks";
import { useIdentityQuery } from "@/shared/api/hooks";
import { normalizePubkey } from "@/shared/lib/pubkey";
import {
  ingestBestieAgentMessageCreatedAt,
  markBestieAgentMessagesSeen,
} from "./bestieAttentionStore";
import {
  applyBestieJobActionsFromAgentMessage,
  applyBestieJobIntentFromUserMessage,
  getBestieJobState,
  markBestieJobFiredForScope,
  useBestieJobs,
} from "./bestieJobStore";
import {
  BESTIE_JOB_RUN_MARKER,
  formatBestieJobRunPrompt,
} from "./bestieJobSchedule";
import { startBestieJobRunner } from "./bestieJobRunner";
import {
  applyBestieListActionsFromAgentMessage,
  applyBestieListIntentFromUserMessage,
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
 * Mounts the ~5 min autonomous wake loop (plus due-reminder one-shots),
 * Bestie Jobs due runner (sends the job prompt as a turn), and watches Bestie
 * DM messages for list/job fences + NL intents. Also drives footer unread.
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
  const sendMutation = useSendMessageMutation(
    bestieChannel,
    identityQuery.data,
  );

  const listScope = React.useMemo(() => {
    if (!relayUrl || !ownerPubkey || !agentPubkey) return null;
    return {
      agentPubkey: normalizePubkey(agentPubkey),
      ownerPubkey: normalizePubkey(ownerPubkey),
      relayUrl,
    };
  }, [agentPubkey, ownerPubkey, relayUrl]);

  const listState = useBestieList(listScope);
  const jobState = useBestieJobs(listScope);
  const ensureAgentRunningRef = React.useRef(bestie.ensureAgentRunning);
  ensureAgentRunningRef.current = bestie.ensureAgentRunning;
  const sendMutateRef = React.useRef(sendMutation.mutateAsync);
  sendMutateRef.current = sendMutation.mutateAsync;
  const channelRef = React.useRef(bestieChannel);
  channelRef.current = bestieChannel;
  const seededUnreadRef = React.useRef(false);
  const seededUnreadChannelRef = React.useRef<string | null>(null);
  const firingJobIdsRef = React.useRef(new Set<string>());

  // Agent fence + user NL for lists and jobs; footer unread for agent posts.
  React.useEffect(() => {
    if (!listScope || !bestieChannel || !agentPubkey || !ownerPubkey) return;
    if (seededUnreadChannelRef.current !== bestieChannel.id) {
      seededUnreadChannelRef.current = bestieChannel.id;
      seededUnreadRef.current = false;
    }
    const agentNorm = normalizePubkey(agentPubkey);
    const ownerNorm = normalizePubkey(ownerPubkey);
    const events = messagesQuery.data ?? [];

    const agentCreatedAts: number[] = [];
    for (const event of events) {
      if (typeof event.content !== "string" || event.content.length === 0) {
        continue;
      }
      const author = normalizePubkey(event.pubkey);
      if (author === agentNorm) {
        if (typeof event.created_at === "number") {
          agentCreatedAts.push(event.created_at);
        }
        applyBestieListActionsFromAgentMessage(
          listScope,
          event.id,
          event.content,
        );
        applyBestieJobActionsFromAgentMessage(
          listScope,
          event.id,
          event.content,
        );
        continue;
      }
      if (author === ownerNorm) {
        // Job-run turns are system-injected — skip NL list/job parsers.
        if (event.content.includes(BESTIE_JOB_RUN_MARKER)) continue;
        applyBestieListIntentFromUserMessage(
          listScope,
          event.id,
          event.content,
        );
        applyBestieJobIntentFromUserMessage(listScope, event.id, event.content);
      }
    }

    if (agentCreatedAts.length === 0) return;
    const maxCreated = Math.max(...agentCreatedAts);
    if (!seededUnreadRef.current) {
      markBestieAgentMessagesSeen(maxCreated);
      seededUnreadRef.current = true;
      return;
    }
    for (const createdAt of agentCreatedAts) {
      ingestBestieAgentMessageCreatedAt(createdAt);
    }
  }, [agentPubkey, bestieChannel, listScope, messagesQuery.data, ownerPubkey]);

  const wakeHandlesRef = React.useRef<ReturnType<
    typeof startBestieWakeScheduler
  > | null>(null);
  const jobHandlesRef = React.useRef<ReturnType<
    typeof startBestieJobRunner
  > | null>(null);

  // Autonomous wake + proactive nudge (footer / popover), ~5 min + due one-shots.
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
    wakeHandlesRef.current = handles;
    return () => {
      handles.stop();
      wakeHandlesRef.current = null;
    };
  }, [listScope]);

  // Jobs: when due, mark fired once and send the job prompt as a user turn.
  React.useEffect(() => {
    if (!listScope) return;
    const handles = startBestieJobRunner({
      getJobState: () => getBestieJobState(listScope),
      intervalMs: BESTIE_WAKE_INTERVAL_MS,
      onDueJobs: (jobs) => {
        for (const job of jobs) {
          if (job.nextDueAt == null) continue;
          if (firingJobIdsRef.current.has(job.id)) continue;
          const dueAt = job.nextDueAt;
          const marked = markBestieJobFiredForScope(listScope, job.id, dueAt);
          if (!marked) continue;
          firingJobIdsRef.current.add(job.id);
          const channel = channelRef.current;
          const content = formatBestieJobRunPrompt(job.title, job.prompt);
          void (async () => {
            try {
              await ensureAgentRunningRef.current();
              if (!channel) return;
              await sendMutateRef.current({
                content,
                parentEventId: null,
                targetChannel: channel,
              });
            } catch {
              // Best-effort; slot already marked so we do not double-send.
            } finally {
              firingJobIdsRef.current.delete(job.id);
            }
          })();
        }
      },
    });
    jobHandlesRef.current = handles;
    return () => {
      handles.stop();
      jobHandlesRef.current = null;
    };
  }, [listScope]);

  // When open reminders / todos change, re-tick wake one-shots.
  const openListSignature = React.useMemo(
    () =>
      listState.items
        .filter((item) => item.status === "open")
        .map((item) => `${item.id}:${item.kind}:${item.dueAt ?? ""}`)
        .sort()
        .join("|"),
    [listState],
  );
  React.useEffect(() => {
    if (!listScope || !openListSignature) return;
    wakeHandlesRef.current?.tick();
  }, [listScope, openListSignature]);

  const openJobSignature = React.useMemo(
    () =>
      jobState.jobs
        .filter((job) => job.enabled)
        .map((job) => `${job.id}:${job.nextDueAt ?? ""}`)
        .sort()
        .join("|"),
    [jobState],
  );
  React.useEffect(() => {
    if (!listScope || !openJobSignature) return;
    jobHandlesRef.current?.tick();
  }, [listScope, openJobSignature]);

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
