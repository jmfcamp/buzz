import * as React from "react";

import { useChannelsQuery } from "@/features/channels/hooks";
import {
  useChannelMessagesQuery,
  useSendMessageMutation,
} from "@/features/messages/hooks";
import { getAgentWorkingState } from "@/features/agents/agentWorkingSignal";
import { useIdentityQuery } from "@/shared/api/hooks";
import { normalizePubkey } from "@/shared/lib/pubkey";
import {
  ingestBestieAgentMessageCreatedAt,
  markBestieAgentMessagesSeen,
} from "./bestieAttentionStore";
import {
  BESTIE_COFFEE_BREW_EVENT,
  BESTIE_COFFEE_RUN_MARKER,
  formatBestieCoffeeRunPrompt,
  isBestieAgentOnlineForCoffee,
} from "./bestieCoffeeSchedule";
import {
  isBestieCoffeePendingStale,
  messageLooksLikeBestieCoffeeTrigger,
} from "./bestieCoffeeLive";
import { startBestieCoffeeRunner } from "./bestieCoffeeRunner";
import {
  applyBestieCoffeeAgentReply,
  beginBestieCoffeeRunForScope,
  clearBestieCoffeePendingRunForScope,
  getBestieCoffeeState,
  setBestieCoffeePendingTriggerForScope,
  useBestieCoffee,
} from "./bestieCoffeeStore";
import {
  applyBestieJobActionsFromAgentMessage,
  applyBestieJobIntentFromUserMessage,
  getBestieJobState,
  markBestieJobFiredForScope,
  useBestieJobs,
} from "./bestieJobStore";
import {
  applyBestieScratchActionsFromAgentMessage,
  applyBestieScratchIntentFromUserMessage,
} from "./bestieScratchStore";
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
  type BestieNudge,
} from "./bestieNudgeStore";
import { findBestieDmChannel } from "./filterBestieDmChannels";
import {
  BESTIE_WAKE_INTERVAL_MS,
  startBestieWakeScheduler,
} from "./bestieWakeScheduler";
import {
  BESTIE_THREAD_SUMMARIZE_EVENT,
  BESTIE_THREAD_SUMMARIZE_MARKER,
  formatBestieThreadSummarizePrompt,
} from "./bestieThreadProtocol";
import {
  applyBestieThreadSummarizeReply,
  clearBestieThreadSummarizeForScope,
  getBestieThreadState,
} from "./bestieThreadStore";
import { useBestie } from "./useBestie";

/** Top-level DM marker for due-reminder notifications (never threaded). */
export const BESTIE_REMINDER_NOTIFY_MARKER = "[Bestie reminder]";

function formatBestieReminderNotifyPrompt(nudge: BestieNudge): string {
  return `${BESTIE_REMINDER_NOTIFY_MARKER}\n\n${nudge.title}\n${nudge.body}`;
}

/**
 * Mounts wake loop, Jobs runner, Coffee scheduler, and watches Assistant DM
 * messages for list/job fences + NL intents + coffee reply capture.
 *
 * Jobs, due-reminder notifies, coffee, and summarize always post as **new
 * top-level Assistant DM messages** (`parentEventId: null`) — never a second
 * channel and never thread replies. Mid-turn notifies rely on ACP
 * `BUZZ_ACP_MULTIPLE_EVENT_HANDLING=queue` so they wait for the current
 * thinking turn, then run as their own top-level turn (not Drop/Steer).
 */
export function BestieWakeController() {
  const bestie = useBestie();
  const identityQuery = useIdentityQuery();
  const channelsQuery = useChannelsQuery();
  const ownerPubkey = identityQuery.data?.pubkey ?? "";
  const agentPubkey = bestie.assignedAgent?.pubkey ?? "";
  const relayUrl = bestie.relayUrl ?? "";
  const presenceStatus = bestie.presenceStatus;

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
  const coffeeState = useBestieCoffee(listScope);
  const ensureAgentRunningRef = React.useRef(bestie.ensureAgentRunning);
  ensureAgentRunningRef.current = bestie.ensureAgentRunning;
  const sendMutateRef = React.useRef(sendMutation.mutateAsync);
  sendMutateRef.current = sendMutation.mutateAsync;
  const channelRef = React.useRef(bestieChannel);
  channelRef.current = bestieChannel;
  const presenceRef = React.useRef(presenceStatus);
  presenceRef.current = presenceStatus;
  const seededUnreadRef = React.useRef(false);
  const seededUnreadChannelRef = React.useRef<string | null>(null);
  const firingJobIdsRef = React.useRef(new Set<string>());
  const coffeeSendingRef = React.useRef(false);
  const postedReminderNudgeIdsRef = React.useRef(new Set<string>());

  const sendTopLevel = React.useCallback(async (content: string) => {
    const channel = channelRef.current;
    if (!channel) return;
    await sendMutateRef.current({
      content,
      // Product rule: Jobs / Reminders / Coffee never parent into a thread.
      parentEventId: null,
      targetChannel: channel,
    });
  }, []);

  const runCoffeeTurn = React.useCallback(
    async (source: "scheduled" | "brew") => {
      if (!listScope || coffeeSendingRef.current) return;
      coffeeSendingRef.current = true;
      try {
        // Brew path may have already begun pending; scheduled begins here.
        if (source === "scheduled") {
          const begun = beginBestieCoffeeRunForScope(listScope, "scheduled");
          if (!begun) return;
        }
        await ensureAgentRunningRef.current();
        await sendTopLevel(formatBestieCoffeeRunPrompt());
      } catch {
        clearBestieCoffeePendingRunForScope(listScope);
      } finally {
        coffeeSendingRef.current = false;
      }
    },
    [listScope, sendTopLevel],
  );

  // Agent fence + user NL for lists/jobs; coffee reply capture; footer unread.
  React.useEffect(() => {
    if (!listScope || !bestieChannel || !agentPubkey || !ownerPubkey) return;
    if (seededUnreadChannelRef.current !== bestieChannel.id) {
      seededUnreadChannelRef.current = bestieChannel.id;
      seededUnreadRef.current = false;
    }
    const agentNorm = normalizePubkey(agentPubkey);
    const ownerNorm = normalizePubkey(ownerPubkey);
    const events = messagesQuery.data ?? [];

    // Pass 1: bind coffee pending → trigger id, collect unmatched coffee triggers
    // so failure / NCP / error replies still land in the Coffee tab.
    const unmatchedCoffeeTriggers = new Map();
    {
      const coffeeState = getBestieCoffeeState(listScope);
      const matchedTriggerIds = new Set(
        coffeeState.entries
          .map((entry) => entry.triggerMessageId)
          .filter((id) => typeof id === "string" && id.length > 0),
      );
      for (const event of events) {
        if (typeof event.content !== "string" || event.content.length === 0) {
          continue;
        }
        if (normalizePubkey(event.pubkey) !== ownerNorm) continue;
        if (!messageLooksLikeBestieCoffeeTrigger(event.content)) continue;
        const livePending = getBestieCoffeeState(listScope).pendingRun;
        if (livePending && !livePending.triggerMessageId) {
          setBestieCoffeePendingTriggerForScope(listScope, event.id);
        }
        if (matchedTriggerIds.has(event.id)) continue;
        const source =
          getBestieCoffeeState(listScope).pendingRun?.source ?? "brew";
        unmatchedCoffeeTriggers.set(event.id, source);
      }
    }

    const agentCreatedAts = [];
    for (const event of events) {
      if (typeof event.content !== "string" || event.content.length === 0) {
        continue;
      }
      const author = normalizePubkey(event.pubkey);
      if (author === agentNorm) {
        if (typeof event.created_at === "number") {
          agentCreatedAts.push(event.created_at);
        }
        const createdAt =
          typeof event.created_at === "number"
            ? event.created_at
            : Math.floor(Date.now() / 1000);
        applyBestieCoffeeAgentReply(
          listScope,
          event.id,
          event.content,
          createdAt,
          event.tags,
          unmatchedCoffeeTriggers,
        );
        applyBestieThreadSummarizeReply(listScope, event.content, createdAt);
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
        applyBestieScratchActionsFromAgentMessage(
          listScope,
          event.id,
          event.content,
        );
        continue;
      }
      if (author === ownerNorm) {
        // System-injected turns — skip NL list/job parsers.
        if (
          event.content.includes(BESTIE_JOB_RUN_MARKER) ||
          event.content.includes(BESTIE_COFFEE_RUN_MARKER) ||
          event.content.includes(BESTIE_REMINDER_NOTIFY_MARKER) ||
          event.content.includes(BESTIE_THREAD_SUMMARIZE_MARKER)
        ) {
          continue;
        }
        applyBestieListIntentFromUserMessage(
          listScope,
          event.id,
          event.content,
        );
        applyBestieJobIntentFromUserMessage(listScope, event.id, event.content);
        applyBestieScratchIntentFromUserMessage(
          listScope,
          event.id,
          event.content,
        );
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
  const coffeeHandlesRef = React.useRef<ReturnType<
    typeof startBestieCoffeeRunner
  > | null>(null);

  // Autonomous wake + proactive nudge; due-reminder also posts top-level DM.
  React.useEffect(() => {
    if (!listScope) return;
    const handles = startBestieWakeScheduler({
      getListState: () => getBestieListState(listScope),
      getPreviousNudgeId: () => getBestieNudge()?.id ?? null,
      intervalMs: BESTIE_WAKE_INTERVAL_MS,
      onNudge: (nudge) => {
        setBestieNudge(nudge);
        if (nudge.reason !== "due-reminder") return;
        if (postedReminderNudgeIdsRef.current.has(nudge.id)) return;
        postedReminderNudgeIdsRef.current.add(nudge.id);
        void (async () => {
          try {
            await ensureAgentRunningRef.current();
            await sendTopLevel(formatBestieReminderNotifyPrompt(nudge));
          } catch {
            // Best-effort notify.
          }
        })();
      },
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
  }, [listScope, sendTopLevel]);

  // Jobs: when due, mark fired once and send the job prompt as a top-level turn.
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
          const content = formatBestieJobRunPrompt(job.title, job.prompt);
          void (async () => {
            try {
              await ensureAgentRunningRef.current();
              await sendTopLevel(content);
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
  }, [listScope, sendTopLevel]);

  // Coffee: morning schedule when online; Brew via window event.
  React.useEffect(() => {
    if (!listScope) return;
    const handles = startBestieCoffeeRunner({
      getCoffeeState: () => getBestieCoffeeState(listScope),
      getIsAgentOnline: () =>
        isBestieAgentOnlineForCoffee(presenceRef.current),
      intervalMs: BESTIE_WAKE_INTERVAL_MS,
      onDueCoffee: () => {
        void runCoffeeTurn("scheduled");
      },
    });
    coffeeHandlesRef.current = handles;

    const onBrew = () => {
      void runCoffeeTurn("brew");
    };
    window.addEventListener(BESTIE_COFFEE_BREW_EVENT, onBrew);
    return () => {
      handles.stop();
      coffeeHandlesRef.current = null;
      window.removeEventListener(BESTIE_COFFEE_BREW_EVENT, onBrew);
    };
  }, [listScope, runCoffeeTurn]);

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

  React.useEffect(() => {
    if (!listScope) return;
    coffeeHandlesRef.current?.tick();
  }, [coffeeState.pendingRun, coffeeState.lastScheduledDayKey, listScope, presenceStatus]);

  // Drop abandoned pendingRun so Brew cannot stay disabled without ACP activity.
  React.useEffect(() => {
    if (!listScope || !coffeeState.pendingRun || !bestieChannel) return;
    const check = () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const working = getAgentWorkingState(
        listScope.agentPubkey,
        bestieChannel.id,
      ).working;
      if (
        isBestieCoffeePendingStale({
          agentWorkingOnBestieDm: working,
          nowSeconds,
          pendingRun: coffeeState.pendingRun,
        })
      ) {
        clearBestieCoffeePendingRunForScope(listScope);
      }
    };
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, [bestieChannel, coffeeState.pendingRun, listScope]);

  // Clear stale nudge when the outstanding set is emptied.
  React.useEffect(() => {
    const nudge = getBestieNudge();
    if (!nudge) return;
    const stillOpen = nudge.itemIds.some((id) =>
      listState.items.some((item) => item.id === id && item.status === "open"),
    );
    if (!stillOpen) clearBestieNudge();
  }, [listState]);

  // Threads: Summarize button → top-level Bestie DM turn with summarize prompt.
  React.useEffect(() => {
    if (!listScope) return;
    const onSummarize = (event: Event) => {
      const detail = (event as CustomEvent<{ threadId?: string }>).detail;
      const threadId = detail?.threadId;
      if (!threadId) return;
      const state = getBestieThreadState(listScope);
      const thread = state.threads.find((entry) => entry.id === threadId);
      if (!thread) {
        clearBestieThreadSummarizeForScope(listScope);
        return;
      }
      void (async () => {
        try {
          await ensureAgentRunningRef.current();
          await sendTopLevel(formatBestieThreadSummarizePrompt(thread));
        } catch {
          clearBestieThreadSummarizeForScope(listScope);
        }
      })();
    };
    window.addEventListener(BESTIE_THREAD_SUMMARIZE_EVENT, onSummarize);
    return () =>
      window.removeEventListener(BESTIE_THREAD_SUMMARIZE_EVENT, onSummarize);
  }, [listScope, sendTopLevel]);

  return null;
}
