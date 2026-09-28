import * as React from "react";

import {
  channelsQueryKey,
  upsertCachedChannel,
  useChannelsQuery,
} from "@/features/channels/hooks";
import {
  useChannelMessagesQuery,
  useSendMessageMutation,
} from "@/features/messages/hooks";
import { useIdentityQuery } from "@/shared/api/hooks";
import type { Channel } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { useQueryClient } from "@tanstack/react-query";
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
import { startBestieCoffeeRunner } from "./bestieCoffeeRunner";
import {
  applyBestieCoffeeAgentReply,
  beginBestieCoffeeRunForScope,
  clearBestieCoffeePendingRunForScope,
  getBestieCoffeeState,
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
import {
  findBestieAutonomousChannel,
} from "./bestieAutonomousChannel";
import {
  readBestieAutonomousChannelId,
} from "./bestieAutonomousChannelStorage";
import { ensureBestieAutonomousChannel } from "./ensureBestieAutonomousChannel";
import { useBestie } from "./useBestie";

/** Top-level DM marker for due-reminder notifications (never threaded). */
export const BESTIE_REMINDER_NOTIFY_MARKER = "[Bestie reminder]";

function formatBestieReminderNotifyPrompt(nudge: BestieNudge): string {
  return `${BESTIE_REMINDER_NOTIFY_MARKER}\n\n${nudge.title}\n${nudge.body}`;
}

/**
 * Mounts wake loop, Jobs runner, Coffee scheduler, and watches Bestie DM
 * messages for list/job fences + NL intents + coffee reply capture.
 *
 * Jobs + due-reminder agent notifies post into a dedicated private stream
 * (`#bestie-jobs`) so ACP gets a separate SessionScope from the interactive
 * Bestie DM — parallel turns without sharing the DM busy/queue. Coffee and
 * thread-summarize stay on the Bestie DM (user-facing chat). All system turns
 * use `parentEventId: null` (never thread replies).
 */
export function BestieWakeController() {
  const bestie = useBestie();
  const queryClient = useQueryClient();
  const identityQuery = useIdentityQuery();
  const channelsQuery = useChannelsQuery();
  const ownerPubkey = identityQuery.data?.pubkey ?? "";
  const agentPubkey = bestie.assignedAgent?.pubkey ?? "";
  const relayUrl = bestie.relayUrl ?? "";
  const presenceStatus = bestie.presenceStatus;
  const assignedAgent = bestie.assignedAgent;

  const bestieChannel = React.useMemo(
    () =>
      findBestieDmChannel(
        channelsQuery.data ?? [],
        ownerPubkey,
        agentPubkey || null,
      ),
    [agentPubkey, channelsQuery.data, ownerPubkey],
  );

  const listScope = React.useMemo(() => {
    if (!relayUrl || !ownerPubkey || !agentPubkey) return null;
    return {
      agentPubkey: normalizePubkey(agentPubkey),
      ownerPubkey: normalizePubkey(ownerPubkey),
      relayUrl,
    };
  }, [agentPubkey, ownerPubkey, relayUrl]);

  const cachedAutonomousChannel = React.useMemo(() => {
    if (!listScope) return null;
    return findBestieAutonomousChannel(channelsQuery.data ?? [], {
      agentPubkey: listScope.agentPubkey,
      storedChannelId: readBestieAutonomousChannelId(listScope),
    });
  }, [channelsQuery.data, listScope]);

  const [autonomousChannel, setAutonomousChannel] =
    React.useState<Channel | null>(null);
  React.useEffect(() => {
    // Only promote cache hits — never clear a freshly created channel while
    // the channels query is still catching up after upsert.
    if (cachedAutonomousChannel) {
      setAutonomousChannel(cachedAutonomousChannel);
    }
  }, [cachedAutonomousChannel]);

  const messagesQuery = useChannelMessagesQuery(bestieChannel);
  const autonomousMessagesQuery = useChannelMessagesQuery(autonomousChannel);
  const sendMutation = useSendMessageMutation(
    bestieChannel,
    identityQuery.data,
  );

  const listState = useBestieList(listScope);
  const jobState = useBestieJobs(listScope);
  const coffeeState = useBestieCoffee(listScope);
  const ensureAgentRunningRef = React.useRef(bestie.ensureAgentRunning);
  ensureAgentRunningRef.current = bestie.ensureAgentRunning;
  const sendMutateRef = React.useRef(sendMutation.mutateAsync);
  sendMutateRef.current = sendMutation.mutateAsync;
  const channelRef = React.useRef(bestieChannel);
  channelRef.current = bestieChannel;
  const autonomousChannelRef = React.useRef(autonomousChannel);
  autonomousChannelRef.current = autonomousChannel;
  const channelsRef = React.useRef(channelsQuery.data ?? []);
  channelsRef.current = channelsQuery.data ?? [];
  const assignedAgentRef = React.useRef(assignedAgent);
  assignedAgentRef.current = assignedAgent;
  const listScopeRef = React.useRef(listScope);
  listScopeRef.current = listScope;
  const resolveAutonomousPromiseRef = React.useRef<Promise<Channel | null> | null>(
    null,
  );
  const presenceRef = React.useRef(presenceStatus);
  presenceRef.current = presenceStatus;
  const seededUnreadRef = React.useRef(false);
  const seededUnreadChannelRef = React.useRef<string | null>(null);
  const firingJobIdsRef = React.useRef(new Set<string>());
  const coffeeSendingRef = React.useRef(false);
  const postedReminderNudgeIdsRef = React.useRef(new Set<string>());

  const resolveAutonomousChannel = React.useCallback(async () => {
    const scope = listScopeRef.current;
    const agent = assignedAgentRef.current;
    if (!scope || !agent) return null;
    if (autonomousChannelRef.current) return autonomousChannelRef.current;
    if (resolveAutonomousPromiseRef.current) {
      return resolveAutonomousPromiseRef.current;
    }
    const promise = (async () => {
      try {
        const channel = await ensureBestieAutonomousChannel({
          agent,
          channels: channelsRef.current,
          scope,
        });
        queryClient.setQueryData<Channel[]>(channelsQueryKey, (current) =>
          upsertCachedChannel(current, channel),
        );
        autonomousChannelRef.current = channel;
        setAutonomousChannel(channel);
        return channel;
      } catch {
        return null;
      }
    })();
    resolveAutonomousPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      if (resolveAutonomousPromiseRef.current === promise) {
        resolveAutonomousPromiseRef.current = null;
      }
    }
  }, [queryClient]);

  /** Bestie DM top-level send (coffee / summarize — stays on chat session). */
  const sendTopLevel = React.useCallback(async (content: string) => {
    const channel = channelRef.current;
    if (!channel) return;
    await sendMutateRef.current({
      content,
      // Product rule: system turns never parent into a thread.
      parentEventId: null,
      targetChannel: channel,
    });
  }, []);

  /**
   * Jobs + reminder notifies: dedicated `#bestie-jobs` stream so ACP opens a
   * parallel SessionScope (does not share Bestie DM busy/queue).
   */
  const sendAutonomousTurn = React.useCallback(
    async (content: string) => {
      const channel = await resolveAutonomousChannel();
      const agentPk = listScopeRef.current?.agentPubkey;
      if (!channel || !agentPk) return;
      await sendMutateRef.current({
        content,
        mentionPubkeys: [agentPk],
        parentEventId: null,
        targetChannel: channel,
      });
    },
    [resolveAutonomousChannel],
  );

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
  // DM = interactive chat. Autonomous stream = job/reminder session replies.
  React.useEffect(() => {
    if (!listScope || !agentPubkey || !ownerPubkey) return;
    const dmChannelId = bestieChannel?.id ?? null;
    if (dmChannelId && seededUnreadChannelRef.current !== dmChannelId) {
      seededUnreadChannelRef.current = dmChannelId;
      seededUnreadRef.current = false;
    }
    const agentNorm = normalizePubkey(agentPubkey);
    const ownerNorm = normalizePubkey(ownerPubkey);
    const dmEvents = messagesQuery.data ?? [];
    const autonomousEvents = autonomousMessagesQuery.data ?? [];

    const agentCreatedAts: number[] = [];

    const ingestAgentFences = (
      event: { id: string; content: string; created_at?: number },
      options: { captureCoffeeAndSummarize: boolean },
    ) => {
      const createdAt =
        typeof event.created_at === "number"
          ? event.created_at
          : Math.floor(Date.now() / 1000);
      if (options.captureCoffeeAndSummarize) {
        applyBestieCoffeeAgentReply(
          listScope,
          event.id,
          event.content,
          createdAt,
        );
        applyBestieThreadSummarizeReply(listScope, event.content, createdAt);
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
      applyBestieScratchActionsFromAgentMessage(
        listScope,
        event.id,
        event.content,
      );
    };

    for (const event of dmEvents) {
      if (typeof event.content !== "string" || event.content.length === 0) {
        continue;
      }
      const author = normalizePubkey(event.pubkey);
      if (author === agentNorm) {
        if (typeof event.created_at === "number") {
          agentCreatedAts.push(event.created_at);
        }
        ingestAgentFences(event, { captureCoffeeAndSummarize: true });
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

    for (const event of autonomousEvents) {
      if (typeof event.content !== "string" || event.content.length === 0) {
        continue;
      }
      const author = normalizePubkey(event.pubkey);
      if (author !== agentNorm) continue;
      ingestAgentFences(event, { captureCoffeeAndSummarize: false });
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
  }, [
    agentPubkey,
    autonomousMessagesQuery.data,
    bestieChannel,
    listScope,
    messagesQuery.data,
    ownerPubkey,
  ]);

  const wakeHandlesRef = React.useRef<ReturnType<
    typeof startBestieWakeScheduler
  > | null>(null);
  const jobHandlesRef = React.useRef<ReturnType<
    typeof startBestieJobRunner
  > | null>(null);
  const coffeeHandlesRef = React.useRef<ReturnType<
    typeof startBestieCoffeeRunner
  > | null>(null);

  // Autonomous wake + proactive nudge; due-reminder also posts on #bestie-jobs.
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
            await sendAutonomousTurn(formatBestieReminderNotifyPrompt(nudge));
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
  }, [listScope, sendAutonomousTurn]);

  // Jobs: when due, mark fired once and send the prompt on #bestie-jobs (parallel session).
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
              await sendAutonomousTurn(content);
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
  }, [listScope, sendAutonomousTurn]);

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
