import {
  ArrowUp,
  ChevronDown,
  Plus,
  SquareArrowOutUpRight,
} from "lucide-react";
import { motion } from "motion/react";
import * as React from "react";
import { toast } from "sonner";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { AgentSessionTranscriptList } from "@/features/agents/ui/AgentSessionTranscriptList";
import { useAgentTranscript } from "@/features/agents/ui/useObserverEvents";
import type { TranscriptItem } from "@/features/agents/ui/agentSessionTypes";
import { useChannelsQuery } from "@/features/channels/hooks";
import {
  mergeMessages,
  useChannelMessagesQuery,
  useChannelSubscription,
  useSendMessageMutation,
  useToggleReactionMutation,
} from "@/features/messages/hooks";
import { formatTimelineMessages } from "@/features/messages/lib/formatTimelineMessages";
import { isNearBottom } from "@/features/messages/lib/timelineSnapshot";
import { useRenderScopedReactionHydration } from "@/features/messages/lib/useRenderScopedReactionHydration";
import type { TimelineMessage } from "@/features/messages/types";
import { TimelineMessageList } from "@/features/messages/ui/TimelineMessageList";
import { TypingIndicatorRow } from "@/features/messages/ui/TypingIndicatorRow";
import { useChannelTyping } from "@/features/messages/useChannelTyping";
import { useThreadRepliesForRoots } from "@/features/messages/useThreadReplies";
import { parkPlaygroundHost } from "@/features/playground/lib/sessions";
import { PresenceDot } from "@/features/presence/ui/PresenceBadge";
import { useProfileQuery } from "@/features/profile/hooks";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import { leaveLeftNavBuzzTerm } from "@/features/terminal/terminalPanelStore";
import { ProtectedMessageActionsBoundary } from "@protected-feature-components";
import { useIdentityQuery } from "@/shared/api/hooks";
import type { Channel, ManagedAgent, PresenceStatus } from "@/shared/api/types";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";
import { cn } from "@/shared/lib/cn";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Textarea } from "@/shared/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { useBestieShowActivity } from "./bestieActivityPreference";
import {
  bestieAskReminderDueAt,
  buildBestieMessageContext,
  buildBestieMessageLink,
  composeBestieAskContent,
  composeBestieAskReminderPrompt,
  composeBestieAskScratchNote,
  composeBestieAskTodoPrompt,
  rememberBestieAskSourceLink,
} from "./bestieMessageContext";
import {
  addBestieListItemForScope,
  applyBestieListIntentFromUserMessage,
  dismissBestieReminderItemsForScope,
  getBestieListState,
  snoozeBestieListItemsForScope,
} from "./bestieListStore";
import {
  addBestieScratchNoteForScope,
  applyBestieScratchIntentFromUserMessage,
} from "./bestieScratchStore";
import { withBestieListTurnHint } from "./bestieListProtocol";
import { withBestieJobTurnHint } from "./bestieJobProtocol";
import { stripBestieOutboundHints } from "./bestieOutboundHints";
import { withBestieLiveListStateHint } from "./bestieLiveListState";
import { applyBestieJobIntentFromUserMessage } from "./bestieJobStore";
import { messageLooksLikeBestieJobRequest } from "./parseBestieUserJobIntent";
import {
  clearBestieMessageThread,
  listBestieMessageThreadRootIds,
  readBestieMessageThread,
  subscribeBestieMessageThreads,
  writeBestieMessageThread,
  type BestieMessageThreadScope,
} from "./bestieMessageThreadStorage";
import {
  clearBestieSessionBoundary,
  readBestieSessionBoundary,
  writeBestieSessionBoundary,
  type BestieSessionBoundary,
  type BestieSessionScope,
} from "./bestieSessionStorage";
import { filterBestieActivityItems } from "./filterBestieActivityItems";
import { findBestieDmChannel } from "./filterBestieDmChannels";
import {
  collectBestieSessionThreadRootIds,
  filterBestieSessionMessages,
  filterMessagesInBestieThread,
  flattenBestieTranscriptMessages,
  resolveBestieComposerThread,
} from "./flattenBestieTranscript";
import {
  messageLooksLikeBestieListRequest,
  messageLooksLikeBestieReminderMeridiemReply,
  messageNeedsBestieReminderBareClockConfirm,
} from "./parseBestieUserListIntent";
import { messageLooksLikeBestieScratchRequest } from "./parseBestieUserScratchIntent";
import {
  clearBestieListIntroNotice,
  useBestieListIntroBannerText,
} from "./bestieAttentionStore";
import { BestieListIntroBanner } from "./BestieListIntroBanner";
import { BestieNewMessageBanner } from "./BestieNewMessageBanner";
import { BestieNudgeBanner } from "./BestieNudgeBanner";
import {
  bestiePopoverNewMessageAckIds,
  resolveBestiePopoverNewMessageQueue,
  type BestiePopoverNewMessageTarget,
} from "./bestiePopoverNewMessage";
import {
  ackBestiePopoverNewMessages,
  useBestiePopoverNewMessageDismissed,
} from "./bestiePopoverNewMessageDismissed";
import { requestBestieRhsOpen } from "./bestieRhsOpenRequest";
import { BestiePopoverListsSection } from "./BestiePopoverListsSection";
import { ensureBestieAgentThreadAccess } from "./bestieThreadAccess";
import {
  BESTIE_THREAD_SUMMARIZE_EVENT,
  bestieThreadId,
} from "./bestieThreadProtocol";
import {
  beginBestieThreadSummarizeForScope,
  upsertBestieTrackedThreadForScope,
} from "./bestieThreadStore";
import { useBestie } from "./useBestie";

/** How long Confirm? stays armed before reverting to Close Thread. */
const CLOSE_THREAD_CONFIRM_MS = 4000;

export function BestieTriggerVisual({
  agent,
  className,
  compact = false,
  imageDraggable,
}: {
  agent: ManagedAgent | null;
  className?: string;
  compact?: boolean;
  imageDraggable?: boolean;
}) {
  if (agent) {
    return (
      <UserAvatar
        avatarUrl={agent.avatarUrl}
        className={cn(compact ? "h-6 w-6" : "h-10 w-10", className)}
        displayName={agent.name}
        fallbackDelayMs={0}
        imageDraggable={imageDraggable}
        size={compact ? "sm" : "md"}
        testId="bestie-trigger-avatar"
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground",
        compact ? "h-8 w-8" : "h-10 w-10",
        className,
      )}
      data-testid="bestie-empty-mark"
    >
      <Plus aria-hidden="true" className={compact ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}

export function BestieAgentLockup({
  agent,
  avatarLayoutId,
  presenceStatus,
  compact = false,
}: {
  agent: ManagedAgent;
  avatarLayoutId?: string;
  presenceStatus: PresenceStatus;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <motion.div
        aria-hidden="true"
        className="relative shrink-0"
        data-testid="bestie-agent-avatar"
        layoutId={avatarLayoutId}
      >
        <UserAvatar
          avatarUrl={agent.avatarUrl}
          className={compact ? "h-5 w-5" : "h-8 w-8"}
          displayName={agent.name}
          fallbackDelayMs={0}
          size={compact ? "xs" : "sm"}
        />
        <span
          className={cn(
            "absolute flex items-center justify-center rounded-full",
            compact
              ? "-bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-sidebar"
              : "-bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-popover",
          )}
        >
          <PresenceDot
            className={compact ? "h-1.5 w-1.5" : "h-2 w-2"}
            data-testid="bestie-activity-dot"
            status={presenceStatus}
          />
        </span>
      </motion.div>
      <span className="min-w-0 truncate text-sm font-medium">{agent.name}</span>
      <span className="sr-only">{presenceStatus}</span>
    </div>
  );
}

function EmptyBestie({
  hideLists = false,
  onRequestClose,
}: {
  hideLists?: boolean;
  onRequestClose?: () => void;
}) {
  const { goAgents } = useAppNavigation();
  const bestie = useBestie();
  const scope =
    bestie.ownerPubkey && bestie.relayUrl
      ? {
          // Persistence is owner+relay; placeholder agent id for type only.
          agentPubkey: "unassigned",
          ownerPubkey: bestie.ownerPubkey,
          relayUrl: bestie.relayUrl,
        }
      : null;

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-3"
      data-testid="bestie-popover-empty"
    >
      <div className="flex shrink-0 items-center gap-2">
        <Button
          aria-label="Choose an Assistant agent"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          data-testid="bestie-assign-agent"
          onClick={() => {
            onRequestClose?.();
            void goAgents();
          }}
          size="icon"
          type="button"
          variant="secondary"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 text-left">
          <h2 className="text-sm font-semibold">Assistant</h2>
          <p className="text-2xs text-muted-foreground">
            No chat yet — + chooses an agent. Lists stay available below.
          </p>
        </div>
      </div>
      <div className="min-h-16 flex-1 rounded-xl border border-dashed border-border/70 bg-muted/20" />
      {scope && !hideLists ? (
        <BestiePopoverListsSection
          brewEnabled={false}
          fillAvailable
          scope={scope}
        />
      ) : null}
    </div>
  );
}

function BestieConversationTranscript({
  activityItems,
  agent,
  channel,
  currentPubkey,
  messages,
  onNearBottomChange,
  onToggleReaction,
  scrollToLatestRef,
  profiles,
  showActivity,
  typingPubkeys,
}: {
  activityItems: TranscriptItem[];
  agent: ManagedAgent;
  channel: Channel;
  currentPubkey: string | undefined;
  messages: TimelineMessage[];
  onNearBottomChange?: (nearBottom: boolean) => void;
  /** Parent registers scroll-to-latest for in-session New message View. */
  scrollToLatestRef?: React.MutableRefObject<(() => void) | null>;
  onToggleReaction: (
    message: TimelineMessage,
    emoji: string,
    remove: boolean,
  ) => Promise<void>;
  profiles: UserProfileLookup;
  showActivity: boolean;
  typingPubkeys: string[];
}) {
  const transcriptRef = React.useRef<HTMLDivElement>(null);
  const bottomSentinelRef = React.useRef<HTMLDivElement>(null);
  // Stick-to-bottom: auto-scroll only while the user is already near the end
  // (or on first open / remount). Reuses desktop chat near-bottom threshold.
  const shouldStickToBottomRef = React.useRef(true);
  const latestMessageKey = messages.at(-1)?.renderKey ?? messages.at(-1)?.id;
  const typingKey = typingPubkeys.join(",");
  const flattenedMessages = React.useMemo(
    () => flattenBestieTranscriptMessages(messages),
    [messages],
  );
  // Reaction hydration still sees the full session message set.
  const mainTimelineEntries = React.useMemo(
    () =>
      flattenedMessages.map((message) => ({
        message,
        summary: null,
      })),
    [flattenedMessages],
  );
  useRenderScopedReactionHydration({
    activeChannel: channel,
    mainTimelineEntries,
    threadHeadMessage: null,
    threadMessages: [],
  });

  const latestActivityKey = activityItems.at(-1)?.id ?? "";
  const transcriptTailKey = [
    channel.id,
    latestMessageKey ?? "",
    String(flattenedMessages.length),
    latestActivityKey,
    showActivity ? "1" : "0",
    typingKey,
  ].join(":");

  React.useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    const onScroll = () => {
      const near = isNearBottom(transcript);
      shouldStickToBottomRef.current = near;
      onNearBottomChange?.(near);
    };
    onScroll();
    transcript.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      transcript.removeEventListener("scroll", onScroll);
    };
  }, [channel.id, onNearBottomChange]);

  React.useLayoutEffect(() => {
    // Fire on open, new messages, and typing rows — but only while sticky.
    void transcriptTailKey;
    if (!shouldStickToBottomRef.current) return;
    const sentinel = bottomSentinelRef.current;
    if (sentinel) {
      sentinel.scrollIntoView({ block: "end" });
      return;
    }
    const transcript = transcriptRef.current;
    if (!transcript) return;
    transcript.scrollTop = transcript.scrollHeight;
  }, [transcriptTailKey]);

  const scrollToLatest = React.useCallback(() => {
    shouldStickToBottomRef.current = true;
    onNearBottomChange?.(true);
    const sentinel = bottomSentinelRef.current;
    if (sentinel) {
      sentinel.scrollIntoView({ block: "end", behavior: "smooth" });
      return;
    }
    const transcript = transcriptRef.current;
    if (transcript) {
      transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
    }
  }, [onNearBottomChange]);

  React.useEffect(() => {
    if (!scrollToLatestRef) return;
    scrollToLatestRef.current = scrollToLatest;
    return () => {
      if (scrollToLatestRef.current === scrollToLatest) {
        scrollToLatestRef.current = null;
      }
    };
  }, [scrollToLatest, scrollToLatestRef]);

  return (
    <div
      aria-live="polite"
      className="min-h-0 flex-1 overflow-y-auto"
      data-bestie-channel-id={channel.id}
      data-bestie-channel-name={channel.name}
      data-testid="bestie-mini-transcript"
      ref={transcriptRef}
    >
      <div className="flex min-h-0 flex-col gap-2 pb-3">
        {flattenedMessages.length > 0 ? (
          <ProtectedMessageActionsBoundary>
            <TimelineMessageList
              channelId={channel.id}
              channelName={channel.name}
              channelType={channel.channelType}
              currentPubkey={currentPubkey}
              mainEntries={mainTimelineEntries}
              messages={flattenedMessages}
              onToggleReaction={onToggleReaction}
              profiles={profiles}
              stickyDayDividers={false}
            />
          </ProtectedMessageActionsBoundary>
        ) : null}

        {showActivity && activityItems.length > 0 ? (
          <div className="px-1" data-testid="bestie-activity-transcript">
            <AgentSessionTranscriptList
              agentAvatarUrl={agent.avatarUrl}
              agentName={agent.name}
              agentPubkey={agent.pubkey}
              autoTail={false}
              channelId={channel.id}
              emptyDescription="Activity will appear here while Assistant works."
              items={activityItems}
              profiles={profiles}
              variant="compactPreview"
            />
          </div>
        ) : null}

        {typingPubkeys.length > 0 ? (
          <div data-testid="bestie-typing-indicator">
            <TypingIndicatorRow
              channel={channel}
              className="shrink-0 px-0 py-0"
              currentPubkey={currentPubkey}
              profiles={profiles}
              typingPubkeys={typingPubkeys}
            />
          </div>
        ) : null}

        <div aria-hidden="true" ref={bottomSentinelRef} />
      </div>
    </div>
  );
}

function toRuntimeBoundary(stored: BestieSessionBoundary): {
  baselineMessageIds: ReadonlySet<string>;
  firstMessageCreatedAt: number;
  sessionRootId: string;
} {
  return {
    baselineMessageIds: new Set(stored.baselineMessageIds),
    firstMessageCreatedAt: stored.firstMessageCreatedAt,
    sessionRootId: stored.sessionRootId,
  };
}

export function BestiePopover({
  avatarLayoutId,
  contextChannelId,
  contextMessage,
  fillAvailable = false,
  onRequestClose,
}: {
  avatarLayoutId?: string;
  contextChannelId?: string | null;
  contextMessage?: TimelineMessage;
  /** Fit the parent popover and keep the composer on screen. */
  fillAvailable?: boolean;
  onRequestClose?: () => void;
}) {
  const bestie = useBestie();
  const { goChannel } = useAppNavigation();
  const showActivity = useBestieShowActivity();
  const [draft, setDraft] = React.useState("");
  const [contextSent, setContextSent] = React.useState(false);
  const [includeMessageContext, setIncludeMessageContext] =
    React.useState(true);
  const includeContextId = React.useId();
  // Two-step Close Thread: first click arms Confirm?, second ends the session.
  const [closeThreadConfirm, setCloseThreadConfirm] = React.useState(false);
  const [conversationChannel, setConversationChannel] =
    React.useState<Channel | null>(null);
  const [sessionBoundary, setSessionBoundary] = React.useState<{
    baselineMessageIds: ReadonlySet<string>;
    firstMessageCreatedAt: number;
    sessionRootId: string;
  } | null>(null);
  const identityQuery = useIdentityQuery();
  const profileQuery = useProfileQuery();
  const channelsQuery = useChannelsQuery();
  const agent = bestie.assignedAgent;
  const assignedAgentPubkey = agent?.pubkey;
  const currentPubkey = identityQuery.data?.pubkey;
  const cachedBestieChannel = React.useMemo(
    () =>
      findBestieDmChannel(
        channelsQuery.data ?? [],
        currentPubkey,
        assignedAgentPubkey,
      ),
    [assignedAgentPubkey, channelsQuery.data, currentPubkey],
  );
  // Prefer resolved state; fall back to channels-cache hit so reopen hydrates
  // the transcript immediately without waiting for resolveConversation.
  const activeConversationChannel = conversationChannel ?? cachedBestieChannel;
  const conversationQuery = useChannelMessagesQuery(activeConversationChannel);
  useChannelSubscription(activeConversationChannel);
  const sendMutation = useSendMessageMutation(
    activeConversationChannel,
    identityQuery.data,
  );
  const toggleReactionMutation = useToggleReactionMutation();
  const toggleReactionMutateRef = React.useRef(
    toggleReactionMutation.mutateAsync,
  );
  toggleReactionMutateRef.current = toggleReactionMutation.mutateAsync;
  const conversationPromiseRef = React.useRef<Promise<Channel> | null>(null);
  const sendLockRef = React.useRef(false);
  const messageThreadRootRef = React.useRef<string | null>(null);
  const resolveConversationForOpen = React.useEffectEvent(() =>
    bestie.resolveConversation(),
  );
  const sessionScope = React.useMemo<BestieSessionScope | null>(() => {
    if (!assignedAgentPubkey || !bestie.ownerPubkey || !bestie.relayUrl) {
      return null;
    }
    return {
      agentPubkey: assignedAgentPubkey,
      ownerPubkey: bestie.ownerPubkey,
      relayUrl: bestie.relayUrl,
    };
  }, [assignedAgentPubkey, bestie.ownerPubkey, bestie.relayUrl]);
  const messageThreadScope =
    React.useMemo<BestieMessageThreadScope | null>(() => {
      if (!sessionScope || !contextChannelId || !contextMessage?.id) {
        return null;
      }
      return {
        ...sessionScope,
        channelId: contextChannelId,
        messageId: contextMessage.id,
      };
    }, [contextChannelId, contextMessage?.id, sessionScope]);
  const [messageThreadRootIds, setMessageThreadRootIds] = React.useState<
    ReadonlySet<string>
  >(() => new Set());

  // Hydrate session boundary before paint so reopen is not blank for a frame.
  // A message ask loads that message's thread, not the bottom Assistant thread.
  React.useLayoutEffect(() => {
    if (!assignedAgentPubkey) {
      setSessionBoundary(null);
      return;
    }
    if (messageThreadScope) {
      const stored = readBestieMessageThread(messageThreadScope);
      messageThreadRootRef.current = stored?.sessionRootId ?? null;
      setSessionBoundary(
        stored
          ? {
              baselineMessageIds: new Set(),
              firstMessageCreatedAt: stored.firstMessageCreatedAt,
              sessionRootId: stored.sessionRootId,
            }
          : null,
      );
      return;
    }
    messageThreadRootRef.current = null;
    if (sessionScope) {
      const stored = readBestieSessionBoundary(sessionScope);
      setSessionBoundary(stored ? toRuntimeBoundary(stored) : null);
    } else {
      setSessionBoundary(null);
    }
  }, [assignedAgentPubkey, messageThreadScope, sessionScope]);

  React.useLayoutEffect(() => {
    if (!sessionScope || messageThreadScope) {
      setMessageThreadRootIds(new Set());
      return;
    }
    const refresh = () => {
      setMessageThreadRootIds(
        new Set(listBestieMessageThreadRootIds(sessionScope)),
      );
    };
    refresh();
    return subscribeBestieMessageThreads(refresh);
  }, [messageThreadScope, sessionScope]);

  const cachedBestieChannelId = cachedBestieChannel?.id ?? null;
  const cachedBestieChannelRef = React.useRef(cachedBestieChannel);
  cachedBestieChannelRef.current = cachedBestieChannel;

  // cachedBestieChannelId re-runs hydrate when the pair DM appears in cache.
  // biome-ignore lint/correctness/useExhaustiveDependencies: channel id is the intentional refresh key
  React.useEffect(() => {
    if (!assignedAgentPubkey) {
      setConversationChannel(null);
      conversationPromiseRef.current = null;
      return;
    }

    // Seed from cache immediately when available (avoids blank until resolve).
    const cached = cachedBestieChannelRef.current;
    if (cached) {
      setConversationChannel((current) => current ?? cached);
    }

    let cancelled = false;
    const pending = resolveConversationForOpen();
    conversationPromiseRef.current = pending;
    void pending
      .then((channel) => {
        if (!cancelled) setConversationChannel(channel);
      })
      .catch((error) => {
        console.warn("Couldn’t load the Assistant conversation", error);
      })
      .finally(() => {
        if (conversationPromiseRef.current === pending) {
          conversationPromiseRef.current = null;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assignedAgentPubkey, cachedBestieChannelId]);

  const currentProfile = profileQuery.data;
  const conversationProfiles = React.useMemo<UserProfileLookup>(() => {
    if (!agent) return {};
    const profiles: UserProfileLookup = {
      [normalizePubkey(agent.pubkey)]: {
        avatarUrl: agent.avatarUrl,
        displayName: agent.name,
        isAgent: true,
        name: agent.name,
        nip05Handle: null,
        ownerPubkey: null,
      },
    };
    if (currentPubkey) {
      profiles[normalizePubkey(currentPubkey)] = {
        avatarUrl: currentProfile?.avatarUrl ?? null,
        displayName: "You",
        isAgent: false,
        name: null,
        nip05Handle: currentProfile?.nip05Handle ?? null,
        ownerPubkey: null,
      };
    }
    return profiles;
  }, [
    agent,
    currentProfile?.avatarUrl,
    currentProfile?.nip05Handle,
    currentPubkey,
  ]);
  const contextEnvelope = React.useMemo(
    () => buildBestieMessageContext(contextChannelId, contextMessage),
    [contextChannelId, contextMessage],
  );

  // Channel window is roots-only; load reply subtrees for the active session
  // so the popover shows the same continuous transcript as the DM thread.
  const sessionThreadRootIds = React.useMemo(() => {
    if (messageThreadScope) {
      return sessionBoundary?.sessionRootId
        ? [sessionBoundary.sessionRootId]
        : [];
    }
    // Channel window is roots-only; treat each as a potential session thread root.
    const channelRoots = (conversationQuery.data ?? []).map((event) => ({
      createdAt: event.created_at,
      id: event.id,
      parentId: null as string | null,
    }));
    return collectBestieSessionThreadRootIds(
      sessionBoundary,
      channelRoots,
      messageThreadRootIds,
    );
  }, [
    conversationQuery.data,
    messageThreadRootIds,
    messageThreadScope,
    sessionBoundary,
  ]);
  const sessionThreadReplies = useThreadRepliesForRoots(
    activeConversationChannel,
    sessionThreadRootIds,
  );
  const mergedConversationEvents = React.useMemo(() => {
    const channelEvents = conversationQuery.data ?? [];
    if (sessionThreadReplies.events.length === 0) return channelEvents;
    return sessionThreadReplies.events.reduce(mergeMessages, channelEvents);
  }, [conversationQuery.data, sessionThreadReplies.events]);

  const allConversationMessages = React.useMemo(() => {
    if (!activeConversationChannel) return [];
    return formatTimelineMessages(
      mergedConversationEvents,
      activeConversationChannel,
      currentPubkey,
      currentProfile?.avatarUrl ?? null,
      conversationProfiles,
    )
      .filter(
        (message) =>
          message.kind === KIND_STREAM_MESSAGE ||
          message.kind === KIND_STREAM_MESSAGE_V2,
      )
      .map((message) => {
        let body = stripBestieOutboundHints(message.body);
        if (contextEnvelope && body.startsWith(contextEnvelope)) {
          body = body.slice(contextEnvelope.length).trim();
        }
        if (body === message.body) return message;
        return { ...message, body };
      })
      .filter((message) => message.body.length > 0);
  }, [
    activeConversationChannel,
    contextEnvelope,
    conversationProfiles,
    currentProfile?.avatarUrl,
    currentPubkey,
    mergedConversationEvents,
  ]);
  const conversationMessages = React.useMemo(() => {
    // Full active-session transcript (chevron dismiss keeps this; Close Thread clears it).
    if (messageThreadScope) {
      const rootId = sessionBoundary?.sessionRootId;
      if (!rootId) return [];
      return filterMessagesInBestieThread(allConversationMessages, rootId);
    }
    return filterBestieSessionMessages(
      allConversationMessages,
      sessionBoundary,
      { excludeRootIds: messageThreadRootIds },
    );
  }, [
    allConversationMessages,
    messageThreadRootIds,
    messageThreadScope,
    sessionBoundary,
  ]);
  const sessionMessageIds = React.useMemo(
    () => new Set(conversationMessages.map((message) => message.id)),
    [conversationMessages],
  );
  const [transcriptNearBottom, setTranscriptNearBottom] = React.useState(true);
  const handleNearBottomChange = React.useCallback((near: boolean) => {
    setTranscriptNearBottom(near);
  }, []);
  const scrollToLatestRef = React.useRef<(() => void) | null>(null);
  const dismissedNewMessages = useBestiePopoverNewMessageDismissed();
  const newMessageQueue = React.useMemo(
    () =>
      resolveBestiePopoverNewMessageQueue({
        allMessages: messageThreadScope
          ? conversationMessages
          : allConversationMessages,
        baselineMessageIds: sessionBoundary?.baselineMessageIds,
        dismissedMessageIds: dismissedNewMessages.messageIds,
        dismissedThreadRootIds: dismissedNewMessages.threadRootIds,
        minCreatedAt: sessionBoundary?.firstMessageCreatedAt ?? null,
        nearBottom: transcriptNearBottom,
        sessionMessageIds,
        sessionRootId: sessionBoundary?.sessionRootId,
      }),
    [
      allConversationMessages,
      conversationMessages,
      dismissedNewMessages.messageIds,
      dismissedNewMessages.threadRootIds,
      messageThreadScope,
      sessionBoundary?.baselineMessageIds,
      sessionBoundary?.firstMessageCreatedAt,
      sessionBoundary?.sessionRootId,
      sessionMessageIds,
      transcriptNearBottom,
    ],
  );
  const newMessageTarget = newMessageQueue[0] ?? null;
  const listIntroBanner = useBestieListIntroBannerText();
  const dismissNewMessage = React.useCallback(
    (target: BestiePopoverNewMessageTarget) => {
      const ack = bestiePopoverNewMessageAckIds(target);
      ackBestiePopoverNewMessages({
        messageIds: [ack.messageId],
        threadRootIds: [ack.threadRootId],
      });
    },
    [],
  );
  // Messages already scrolled into view (near bottom) stay out of the queue.
  React.useEffect(() => {
    if (!transcriptNearBottom) return;
    if (sessionMessageIds.size === 0) return;
    ackBestiePopoverNewMessages({
      messageIds: [...sessionMessageIds],
    });
  }, [sessionMessageIds, transcriptNearBottom]);
  const jumpToNewMessage = React.useCallback(
    (target: BestiePopoverNewMessageTarget) => {
      dismissNewMessage(target);
      if (!target.outsideSession) {
        scrollToLatestRef.current?.();
        return;
      }
      const message = allConversationMessages.find(
        (entry) => entry.id === target.id,
      );
      if (!message) return;
      // Open the Assistant DM on that thread in the main app. Do NOT change the
      // popover session/thread — the popover stays where it is.
      const rootId = message.rootId ?? message.parentId ?? message.id;
      void (async () => {
        parkPlaygroundHost();
        leaveLeftNavBuzzTerm();
        const channel =
          activeConversationChannel ??
          (await (conversationPromiseRef.current ??
            bestie.resolveConversation()));
        setConversationChannel(channel);
        await goChannel(channel.id, { thread: rootId });
      })().catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn’t open Assistant conversation",
        );
      });
    },
    [
      activeConversationChannel,
      allConversationMessages,
      bestie,
      dismissNewMessage,
      goChannel,
    ],
  );
  const typingEntries = useChannelTyping(
    activeConversationChannel,
    currentPubkey,
  );
  const typingPubkeys = React.useMemo(
    () => typingEntries.map((entry) => entry.pubkey),
    [typingEntries],
  );
  const agentTranscript = useAgentTranscript(
    showActivity && Boolean(assignedAgentPubkey),
    assignedAgentPubkey,
  );
  const activityItems = React.useMemo(
    () =>
      filterBestieActivityItems(agentTranscript, {
        channelId: activeConversationChannel?.id,
        sessionBoundary: sessionBoundary
          ? { firstMessageCreatedAt: sessionBoundary.firstMessageCreatedAt }
          : null,
      }),
    [activeConversationChannel?.id, agentTranscript, sessionBoundary],
  );
  const handleToggleReaction = React.useCallback(
    async (message: TimelineMessage, emoji: string, remove: boolean) => {
      await toggleReactionMutateRef.current({
        emoji,
        eventId: message.id,
        remove,
      });
    },
    [],
  );
  // Close Thread ends the session (next open = blank). Chevron only calls
  // onRequestClose and leaves localStorage boundary intact so reopen resumes.
  // First click arms Confirm?; second click (or timeout / chevron / reopen) resets.
  React.useEffect(() => {
    if (!closeThreadConfirm) return;
    const timer = window.setTimeout(() => {
      setCloseThreadConfirm(false);
    }, CLOSE_THREAD_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [closeThreadConfirm]);

  const dismissPopover = React.useCallback(() => {
    setCloseThreadConfirm(false);
    onRequestClose?.();
  }, [onRequestClose]);

  const closeThread = React.useCallback(() => {
    if (messageThreadScope) {
      clearBestieMessageThread(messageThreadScope);
    } else if (sessionScope) {
      clearBestieSessionBoundary(sessionScope);
    }
    messageThreadRootRef.current = null;
    setSessionBoundary(null);
    setContextSent(false);
    setDraft("");
    setCloseThreadConfirm(false);
    onRequestClose?.();
  }, [messageThreadScope, onRequestClose, sessionScope]);

  const handleCloseThreadClick = React.useCallback(() => {
    if (!closeThreadConfirm) {
      setCloseThreadConfirm(true);
      return;
    }
    closeThread();
  }, [closeThread, closeThreadConfirm]);

  const openSessionThread = React.useCallback(() => {
    void (async () => {
      parkPlaygroundHost();
      leaveLeftNavBuzzTerm();
      const channel =
        activeConversationChannel ??
        (await (conversationPromiseRef.current ??
          bestie.resolveConversation()));
      setConversationChannel(channel);
      await goChannel(
        channel.id,
        sessionBoundary?.sessionRootId
          ? { thread: sessionBoundary.sessionRootId }
          : undefined,
      );
      dismissPopover();
    })().catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn’t open Assistant conversation",
      );
    });
  }, [
    activeConversationChannel,
    bestie,
    dismissPopover,
    goChannel,
    sessionBoundary?.sessionRootId,
  ]);

  if (bestie.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading Assistant…</p>;
  }
  if (!agent) {
    return (
      <EmptyBestie
        hideLists={Boolean(contextMessage)}
        onRequestClose={onRequestClose}
      />
    );
  }

  const presenceStatus = bestie.presenceStatus ?? "offline";
  const sendAskContent = (
    rawBody: string,
    options?: { clearDraft?: boolean; forceListHint?: boolean },
  ) => {
    const trimmedDraft = rawBody.trim();
    if (
      !trimmedDraft ||
      bestie.isOpening ||
      sendMutation.isPending ||
      sendLockRef.current
    ) {
      return;
    }
    sendLockRef.current = true;
    void (async () => {
      try {
        const baselineMessageIds = new Set(
          allConversationMessages.map((message) => message.id),
        );
        const startResult = bestie.ensureAgentRunning().then(
          () => ({ error: null }),
          (error: unknown) => ({ error }),
        );
        const channel =
          activeConversationChannel ??
          (await (conversationPromiseRef.current ??
            bestie.resolveConversation()));
        setConversationChannel(channel);
        const composerThread = resolveBestieComposerThread({
          footerSessionRootId: messageThreadScope
            ? null
            : (sessionBoundary?.sessionRootId ?? null),
          isMessageAsk: messageThreadScope != null,
          messageThreadRootId: messageThreadScope
            ? (messageThreadRootRef.current ??
              sessionBoundary?.sessionRootId ??
              null)
            : null,
        });
        const parentEventId = composerThread.parentEventId;
        // Confirm Qs / AM-PM replies stay in-session (parentEventId = session root
        // when active; null only for a brand-new session root).
        const pendingReminderConfirm =
          sessionScope &&
          bestie.ownerPubkey &&
          assignedAgentPubkey &&
          bestie.relayUrl
            ? getBestieListState({
                agentPubkey: normalizePubkey(assignedAgentPubkey),
                ownerPubkey: normalizePubkey(bestie.ownerPubkey),
                relayUrl: bestie.relayUrl,
              }).pendingReminderConfirm
            : null;
        const meridiemReply =
          pendingReminderConfirm != null &&
          messageLooksLikeBestieReminderMeridiemReply(trimmedDraft);
        const listIntent =
          options?.forceListHint === true ||
          messageLooksLikeBestieListRequest(trimmedDraft) ||
          meridiemReply;
        const bareClockConfirm =
          messageNeedsBestieReminderBareClockConfirm(trimmedDraft);
        const jobIntent = messageLooksLikeBestieJobRequest(trimmedDraft);
        const scratchIntent =
          messageLooksLikeBestieScratchRequest(trimmedDraft);
        const liveScope =
          sessionScope &&
          bestie.ownerPubkey &&
          assignedAgentPubkey &&
          bestie.relayUrl
            ? {
                agentPubkey: normalizePubkey(assignedAgentPubkey),
                ownerPubkey: normalizePubkey(bestie.ownerPubkey),
                relayUrl: bestie.relayUrl,
              }
            : null;
        let outboundBody = withBestieLiveListStateHint(trimmedDraft, liveScope);
        outboundBody = withBestieListTurnHint(outboundBody, listIntent, {
          bareClockConfirm,
        });
        outboundBody = withBestieJobTurnHint(outboundBody, jobIntent);
        const composed = composeBestieAskContent(
          outboundBody,
          contextEnvelope,
          {
            contextAlreadySent: contextSent,
            includeContext: includeMessageContext,
          },
        );
        const content = composed.content;
        const sentMessage = await sendMutation.mutateAsync({
          content,
          parentEventId,
          targetChannel: channel,
        });
        // Apply NL list/job/scratch intents immediately (WakeController also applies; idempotent).
        // Job schedule-request/approve-intent do not create — confirmed fence or RHS form does.
        if (
          (listIntent || jobIntent || scratchIntent) &&
          sessionScope &&
          bestie.ownerPubkey &&
          assignedAgentPubkey &&
          bestie.relayUrl
        ) {
          const scope = {
            agentPubkey: normalizePubkey(assignedAgentPubkey),
            ownerPubkey: normalizePubkey(bestie.ownerPubkey),
            relayUrl: bestie.relayUrl,
          };
          if (listIntent) {
            applyBestieListIntentFromUserMessage(
              scope,
              sentMessage.id,
              trimmedDraft,
            );
          }
          if (jobIntent) {
            applyBestieJobIntentFromUserMessage(
              scope,
              sentMessage.id,
              trimmedDraft,
            );
          }
          if (scratchIntent) {
            applyBestieScratchIntentFromUserMessage(
              scope,
              sentMessage.id,
              trimmedDraft,
            );
          }
        }
        if (composerThread.create !== "none") {
          const next = {
            baselineMessageIds,
            firstMessageCreatedAt: sentMessage.created_at,
            sessionRootId: sentMessage.id,
          };
          if (composerThread.create === "message" && messageThreadScope) {
            messageThreadRootRef.current = next.sessionRootId;
            writeBestieMessageThread(messageThreadScope, {
              firstMessageCreatedAt: next.firstMessageCreatedAt,
              sessionRootId: next.sessionRootId,
            });
          } else if (composerThread.create === "footer" && sessionScope) {
            writeBestieSessionBoundary(sessionScope, {
              baselineMessageIds: [...baselineMessageIds],
              firstMessageCreatedAt: next.firstMessageCreatedAt,
              sessionRootId: next.sessionRootId,
            });
          }
          setSessionBoundary(next);
        }
        if (composed.attachedContext) setContextSent(true);
        if (options?.clearDraft !== false) setDraft("");
        const { error: startError } = await startResult;
        if (startError) throw startError;
      } finally {
        sendLockRef.current = false;
      }
    })().catch((error) => {
      toast.error(
        error instanceof Error ? error.message : "Couldn’t message Assistant",
      );
    });
  };

  const sendMessage = () => {
    sendAskContent(draft);
  };

  const sendAskQuickPrompt = (
    prompt: string,
    options?: { forceListHint?: boolean },
  ) => {
    sendAskContent(prompt, {
      clearDraft: false,
      forceListHint: options?.forceListHint,
    });
  };

  const saveLinkedListItem = (
    kind: "reminder" | "todo",
    dueAt?: number | null,
  ) => {
    const messageLink = buildBestieMessageLink(
      contextChannelId,
      contextMessage,
    );
    if (!sessionScope || !messageLink) {
      toast.error("Couldn’t link this message");
      return;
    }
    addBestieListItemForScope(sessionScope, {
      dueAt: dueAt ?? null,
      kind,
      text: messageLink,
    });
    toast.success(kind === "reminder" ? "Reminder saved" : "To-do saved");
  };

  const enrollAndSummarizeContextThread = () => {
    const ownerPubkey = bestie.ownerPubkey;
    if (
      !sessionScope ||
      !contextChannelId ||
      !contextMessage ||
      !assignedAgentPubkey ||
      !ownerPubkey
    ) {
      toast.error("Couldn’t add this thread to Assistant yet");
      return;
    }
    const scope = sessionScope;
    const channelId = contextChannelId;
    const message = contextMessage;
    const agentPubkey = assignedAgentPubkey;
    const rootEventId = message.rootId ?? message.id;
    const channel = (channelsQuery.data ?? []).find(
      (entry) => entry.id === channelId,
    );
    void (async () => {
      try {
        const access = await ensureBestieAgentThreadAccess({
          agentPubkey,
          channelId,
          ownerPubkey,
        });
        if (!access.ok) {
          toast.error(access.error);
          return;
        }
        const next = upsertBestieTrackedThreadForScope(scope, {
          authorName: message.author ?? null,
          channelId,
          channelName: channel?.name ?? null,
          preview: message.body ?? "",
          rootEventId,
          source: "ask",
        });
        const threadId = bestieThreadId(channelId, rootEventId);
        const thread =
          next.threads.find((entry) => entry.id === threadId) ?? null;
        if (!thread) {
          toast.error("Couldn’t enroll this thread");
          return;
        }
        const begun = beginBestieThreadSummarizeForScope(scope, thread.id);
        if (!begun) {
          toast.error("A summarize is already in progress.");
          return;
        }
        window.dispatchEvent(
          new CustomEvent(BESTIE_THREAD_SUMMARIZE_EVENT, {
            detail: { threadId: thread.id },
          }),
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn’t add thread and summarize",
        );
      }
    })();
  };

  const hasScrollableTranscript =
    Boolean(activeConversationChannel) &&
    (conversationMessages.length > 0 ||
      typingPubkeys.length > 0 ||
      (showActivity && activityItems.length > 0));

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-3",
        fillAvailable ? "min-h-0 flex-1 overflow-hidden" : "h-full",
      )}
      data-testid="bestie-popover"
    >
      <div className="flex shrink-0 items-start gap-2">
        <BestieAgentLockup
          agent={agent}
          avatarLayoutId={avatarLayoutId}
          presenceStatus={presenceStatus}
        />
        <div className="flex-1" />
        <Button
          aria-label={
            closeThreadConfirm ? "Confirm close thread" : "Close Thread"
          }
          className={
            closeThreadConfirm
              ? "h-7 rounded-full px-2.5 text-xs font-medium shadow-none"
              : "h-7 rounded-full border border-border/50 bg-muted/45 px-2.5 text-xs font-medium text-foreground shadow-none hover:bg-muted/70"
          }
          data-testid="bestie-close-thread"
          onClick={handleCloseThreadClick}
          size="xs"
          type="button"
          variant={closeThreadConfirm ? "destructive" : "ghost"}
        >
          {closeThreadConfirm ? "Confirm?" : "Close Thread"}
        </Button>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            aria-label="Open Assistant thread"
            data-testid="bestie-open-thread"
            disabled={bestie.isOpening}
            onClick={openSessionThread}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <SquareArrowOutUpRight />
          </Button>
          <Button
            aria-label="Close Assistant"
            data-testid="bestie-close"
            onClick={dismissPopover}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ChevronDown />
          </Button>
        </div>
      </div>

      <BestieNudgeBanner
        onDismissItems={(itemIds) => {
          if (!sessionScope) return;
          dismissBestieReminderItemsForScope(sessionScope, itemIds);
        }}
        onOpenReminders={() => {
          requestBestieRhsOpen("reminder");
        }}
        onOpenTodos={() => {
          requestBestieRhsOpen("todo");
        }}
        onSnoozeItems={(itemIds, deltaSeconds) => {
          if (!sessionScope) return;
          snoozeBestieListItemsForScope(sessionScope, itemIds, deltaSeconds);
        }}
      />

      {listIntroBanner && !newMessageTarget ? (
        <BestieListIntroBanner
          onDismiss={clearBestieListIntroNotice}
          text={listIntroBanner}
        />
      ) : null}

      {newMessageTarget ? (
        <BestieNewMessageBanner
          queueLength={newMessageQueue.length}
          target={newMessageTarget}
          onDismiss={dismissNewMessage}
          onView={jumpToNewMessage}
        />
      ) : null}

      {hasScrollableTranscript && activeConversationChannel ? (
        <BestieConversationTranscript
          activityItems={activityItems}
          agent={agent}
          channel={activeConversationChannel}
          currentPubkey={currentPubkey}
          messages={conversationMessages}
          onNearBottomChange={handleNearBottomChange}
          onToggleReaction={handleToggleReaction}
          profiles={conversationProfiles}
          scrollToLatestRef={scrollToLatestRef}
          showActivity={showActivity}
          typingPubkeys={typingPubkeys}
        />
      ) : (
        <div
          aria-hidden="true"
          className="min-h-16 flex-1"
          data-testid="bestie-popover-chat-spacer"
        />
      )}

      <div className="relative shrink-0">
        <Textarea
          aria-label={`Message ${agent.name}`}
          className="min-h-24 resize-none rounded-2xl pb-11"
          data-bloom-autofocus
          data-testid="bestie-composer"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey ||
              event.nativeEvent.isComposing
            ) {
              return;
            }
            event.preventDefault();
            sendMessage();
          }}
          placeholder={`Message ${agent.name}`}
          value={draft}
        />
        <Button
          aria-label="Send in Assistant conversation"
          className="absolute bottom-2 right-2 rounded-full"
          disabled={!draft.trim() || bestie.isOpening || sendMutation.isPending}
          onClick={sendMessage}
          size="icon"
          type="button"
        >
          <ArrowUp />
        </Button>
      </div>

      {contextMessage && !contextSent ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label
            className="flex w-fit cursor-pointer items-center gap-2 text-sm"
            htmlFor={includeContextId}
          >
            <Checkbox
              checked={includeMessageContext}
              data-testid="bestie-include-message-context"
              id={includeContextId}
              onCheckedChange={(checked) =>
                setIncludeMessageContext(checked === true)
              }
            />
            Include message context
          </label>
          {includeMessageContext && contextEnvelope ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex h-6 cursor-default items-center rounded-full border border-border/70 bg-muted/50 px-2 text-xs text-muted-foreground"
                  data-testid="bestie-message-context-chip"
                >
                  Include message context
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm whitespace-pre-wrap">
                {contextEnvelope}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      ) : null}

      {contextMessage ? (
        <div
          className="shrink-0 space-y-2"
          data-testid="bestie-ask-quick-actions"
        >
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Reminder
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["15m", "15 minutes"],
                  ["1h", "1 hour"],
                  ["24h", "24 hours"],
                ] as const
              ).map(([delay, label]) => (
                <Button
                  key={delay}
                  className="h-7 rounded-full border border-border/50 bg-muted/45 px-2.5 text-xs font-medium text-foreground shadow-none hover:bg-muted/70"
                  data-testid={`bestie-ask-reminder-${delay}`}
                  disabled={bestie.isOpening || sendMutation.isPending}
                  onClick={() => {
                    const messageLink = buildBestieMessageLink(
                      contextChannelId,
                      contextMessage,
                    );
                    if (includeMessageContext) {
                      if (sessionScope && messageLink) {
                        rememberBestieAskSourceLink(sessionScope, messageLink);
                      }
                      sendAskQuickPrompt(
                        composeBestieAskReminderPrompt(delay, messageLink),
                        { forceListHint: true },
                      );
                      return;
                    }
                    saveLinkedListItem(
                      "reminder",
                      bestieAskReminderDueAt(delay),
                    );
                  }}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <Button
            className="h-7 w-full rounded-full border border-border/50 bg-muted/45 px-2.5 text-xs font-medium text-foreground shadow-none hover:bg-muted/70"
            data-testid="bestie-ask-add-todo"
            disabled={bestie.isOpening || sendMutation.isPending}
            onClick={() => {
              const messageLink = buildBestieMessageLink(
                contextChannelId,
                contextMessage,
              );
              if (includeMessageContext) {
                if (sessionScope && messageLink) {
                  rememberBestieAskSourceLink(sessionScope, messageLink);
                }
                sendAskQuickPrompt(composeBestieAskTodoPrompt(messageLink), {
                  forceListHint: true,
                });
                return;
              }
              saveLinkedListItem("todo");
            }}
            size="xs"
            type="button"
            variant="ghost"
          >
            Add to my to-dos
          </Button>
          <Button
            className="h-7 w-full rounded-full border border-border/50 bg-muted/45 px-2.5 text-xs font-medium text-foreground shadow-none hover:bg-muted/70"
            data-testid="bestie-ask-add-thread-summarize"
            disabled={bestie.isOpening || sendMutation.isPending}
            onClick={enrollAndSummarizeContextThread}
            size="xs"
            type="button"
            variant="ghost"
          >
            Add to Threads & summarize
          </Button>
          <Button
            className="h-7 w-full rounded-full border border-border/50 bg-muted/45 px-2.5 text-xs font-medium text-foreground shadow-none hover:bg-muted/70"
            data-testid="bestie-ask-scratch"
            disabled={bestie.isOpening || sendMutation.isPending}
            onClick={() => {
              const messageLink = buildBestieMessageLink(
                contextChannelId,
                contextMessage,
              );
              const note = composeBestieAskScratchNote({
                author: contextMessage?.author,
                body: contextMessage?.body,
                messageLink,
              });
              if (!sessionScope || !note.body) {
                toast.error("Couldn’t save this message to scratch");
                return;
              }
              addBestieScratchNoteForScope(sessionScope, note);
              toast.success("Saved to scratch pad");
            }}
            size="xs"
            type="button"
            variant="ghost"
          >
            Write to scratch pad
          </Button>
        </div>
      ) : sessionScope ? (
        <BestiePopoverListsSection
          bestieChannel={activeConversationChannel}
          brewEnabled
          scope={sessionScope}
        />
      ) : null}
    </div>
  );
}
