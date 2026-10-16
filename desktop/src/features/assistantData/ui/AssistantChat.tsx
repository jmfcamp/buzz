// Web Assistant popover body: same layout/markup as the desktop Assistant popover — agent lockup header, nudge
// banner, mini transcript (TimelineMessageList), rounded composer with the round send button, and the "Lists"
// expansion card. Your DM with the Assistant goes over the relay (signer-only); typed list requests apply at once.
import { Bell, ChevronDown, SquareArrowOutUpRight } from "lucide-react";
import * as React from "react";

import { useManagedAgentsQuery } from "@/features/agents/hooks";
import { useChannelsQuery, useOpenDmMutation } from "@/features/channels/hooks";
import { useCommunities } from "@/features/communities/useCommunities";
import { formatTimelineMessages } from "@/features/messages/lib/formatTimelineMessages";
import {
  mergeMessages,
  useChannelMessagesQuery,
  useChannelSubscription,
  useSendMessageMutation,
  useToggleReactionMutation,
} from "@/features/messages/hooks";
import type { TimelineMessage } from "@/features/messages/types";
import { TimelineMessageList } from "@/features/messages/ui/TimelineMessageList";
import { usePresenceQuery } from "@/features/presence/hooks";
import { PresenceDot } from "@/features/presence/ui/PresenceBadge";
import { useProfileQuery, useUserProfileQuery } from "@/features/profile/hooks";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import { useIdentityQuery } from "@/shared/api/hooks";
import { tryRunRoutineByName } from "@/features/assistantRoutines/runRoutineByName";
import { startManagedAgent } from "@/shared/api/tauriManagedAgents";
import type { Channel, RelayEvent } from "@/shared/api/types";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { MessageComposer } from "@/features/messages/ui/MessageComposer";
import {
  deleteDraftEntry,
  loadDraftEntry,
  saveDraftEntry,
} from "@/features/messages/lib/useDrafts";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { ASK_EVENT, takeAsk } from "@/features/assistant/askBus";
import {
  assistantListTurnHint,
  stripAssistantListHint,
} from "@/features/assistant/listProtocol";
import { useAssistantShowActivity } from "@/features/assistant/activityPreference";
import { AgentSessionTranscriptList } from "@/features/agents/ui/AgentSessionTranscriptList";
import { isMeaningfulItem } from "@/features/agents/ui/agentSessionTranscriptPresentation";
import { useAgentTranscript } from "@/features/agents/ui/useObserverEvents";
import { TypingIndicatorRow } from "@/features/messages/ui/TypingIndicatorRow";
import { useChannelTyping } from "@/features/messages/useChannelTyping";
import { useThreadRepliesForRoots } from "@/features/messages/useThreadReplies";

import { useAppShell } from "@/app/AppShellContext";
import { useAutoDirectWhileOpen } from "@/features/bridge/ui/DesktopData";

import { useDirectLive } from "../dataStore";
import { planAssistantSeenReads } from "../seenReads";
import {
  assistDraftKey,
  readDraftGen,
  writeDraftGen,
  readConversationStart,
  writeConversationStart,
} from "../conversationStart";
import {
  applyAssistantListFencesFromMessage,
  messageMayContainAssistantListFence,
} from "@/features/assistantLists/listFences";
import { applyWebUserIntents } from "../webIntents";
import { AssistantListsCard, useSuiteSummary } from "./AssistantSuite";

// Hide the Assistant's machine-readable action blocks (```<name>-list|job|scratch|coffee|thread …```) like the
// desktop transcript; their changes show up in Lists.
const ACTION_FENCE =
  /```[a-z]+-(?:list|lists|job|jobs|scratch|coffee|thread|threads)\b[\s\S]*?```/gi;

const CLOSE_THREAD_CONFIRM_MS = 4000;

export function displayText(content: string) {
  return stripAssistantListHint(content)
    .replace(ACTION_FENCE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findPairDm(
  channels: readonly Channel[],
  me: string,
  agent: string,
): Channel | null {
  return (
    channels.find((c) => {
      if (c.channelType !== "dm") return false;
      const ps = new Set(
        (c.participantPubkeys ?? []).map((p) => p.toLowerCase()),
      );
      return ps.size === 2 && ps.has(me) && ps.has(agent);
    }) ?? null
  );
}

export function AssistantPopoverBody({
  agentPubkey,
  fallbackName,
  fallbackAvatarUrl,
  onMinimize,
  onOpenConversation,
  visible = true,
}: {
  agentPubkey: string;
  fallbackName?: string;
  fallbackAvatarUrl?: string | null;
  onClose?: () => void;
  onMinimize: () => void;
  onOpenConversation: (channel: Channel | null) => void;
  /** False while the popup is minimized (still mounted, hidden): nothing counts as seen then. */
  visible?: boolean;
}) {
  const identity = useIdentityQuery().data;
  const me = identity?.pubkey?.toLowerCase();
  const myProfile = useProfileQuery().data;
  const profile = useUserProfileQuery(agentPubkey).data;
  const presence =
    usePresenceQuery([agentPubkey]).data?.[agentPubkey] ?? "offline";
  const name = profile?.displayName || fallbackName || "Assistant";
  const avatarUrl = profile?.avatarUrl ?? fallbackAvatarUrl ?? null;
  const { activeCommunity } = useCommunities();
  const channels = useChannelsQuery().data ?? [];
  const [created, setCreated] = React.useState<Channel | null>(null);
  const channel = React.useMemo(
    () => created ?? (me ? findPairDm(channels, me, agentPubkey) : null),
    [created, channels, me, agentPubkey],
  );
  const events = useChannelMessagesQuery(channel).data as
    | RelayEvent[]
    | undefined;
  useChannelSubscription(channel);
  const send = useSendMessageMutation(channel, identity);
  const openDm = useOpenDmMutation();
  const toggleReaction = useToggleReactionMutation();
  const [error, setError] = React.useState<string | null>(null);
  const managed = (useManagedAgentsQuery().data ?? []).find(
    (a) => a.pubkey.toLowerCase() === agentPubkey,
  );
  const directLive = useDirectLive();
  // Jobs / Coffee / Threads / Scratch are read from the desktop over Direct: connect when the popup opens instead of
  // waiting for the Agents or Settings page to do it (they were the only callers, so these sections never loaded).
  useAutoDirectWhileOpen(visible);
  const { markChannelRead, markMessageRead, markThreadRead } = useAppShell();
  const [starting, setStarting] = React.useState(false);
  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      await startManagedAgent(agentPubkey, {
        ...(activeCommunity?.relayUrl
          ? { expectedRelayUrl: activeCommunity.relayUrl }
          : {}),
        ...(me ? { expectedSignerPubkey: me } : {}),
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't start the assistant.",
      );
    } finally {
      setStarting(false);
    }
  };
  // Same composer as channels/threads (MessageComposer). Text is injected (Ask Assistant) or cleared (Close Thread)
  // by moving to a fresh draft key: the composer saves the outgoing key and loads the new one we pre-filled.
  const [draftGen, setDraftGen] = React.useState(() =>
    readDraftGen(me, agentPubkey),
  );
  const draftKey = assistDraftKey(me, agentPubkey, draftGen);
  const draftKeyRef = React.useRef(draftKey);
  draftKeyRef.current = draftKey;
  const composerBoxRef = React.useRef<HTMLDivElement>(null);
  const nextDraft = React.useCallback(
    (content: string) => {
      const prevKey = draftKeyRef.current;
      const next = readDraftGen(me, agentPubkey) + 1;
      writeDraftGen(me, agentPubkey, next);
      const key = assistDraftKey(me, agentPubkey, next);
      if (content.trim()) {
        const now = new Date().toISOString();
        saveDraftEntry(key, {
          channelId: channel?.id ?? "",
          content,
          createdAt: now,
          pendingImeta: [],
          selectionEnd: content.length,
          selectionStart: content.length,
          spoileredAttachmentUrls: [],
          status: "active",
          updatedAt: now,
        });
      }
      setDraftGen(next);
      // The old key was saved by the composer on the key change; drop it so it doesn't linger in Drafts.
      window.setTimeout(() => deleteDraftEntry(prevKey), 0);
    },
    [me, agentPubkey, channel?.id],
  );
  // "Ask Assistant about this message": take the queued context draft (now, and whenever another arrives).
  React.useEffect(() => {
    const apply = () => {
      const text = takeAsk();
      if (!text) return;
      const current = loadDraftEntry(draftKeyRef.current)?.content ?? "";
      nextDraft(current.trim() ? `${text}\n\n${current}` : `${text}\n\n`);
      setTab("chat");
      window.setTimeout(() => {
        const el = composerBoxRef.current?.querySelector<HTMLElement>(
          "[contenteditable='true'], textarea",
        );
        el?.focus({ preventScroll: true });
      }, 80);
    };
    apply();
    window.addEventListener(ASK_EVENT, apply);
    return () => window.removeEventListener(ASK_EVENT, apply);
  }, [nextDraft]);
  const typingEntries = useChannelTyping(channel, me);
  const typingPubkeys = React.useMemo(
    () => typingEntries.map((entry) => entry.pubkey),
    [typingEntries],
  );
  const showActivity = useAssistantShowActivity();
  const agentTranscript = useAgentTranscript(showActivity, agentPubkey);
  const activityItems = React.useMemo(
    () =>
      agentTranscript.filter(
        (item) =>
          item.type !== "message" &&
          isMeaningfulItem(item) &&
          item.renderClass !== "raw-rail" &&
          item.renderClass !== "suppressed" &&
          (!channel || !item.channelId || item.channelId === channel.id),
      ),
    [agentTranscript, channel],
  );
  const [busy, setBusy] = React.useState(false);
  const transcriptRef = React.useRef<HTMLDivElement>(null);
  const tabbed = useTabbedLayout();
  const summary = useSuiteSummary(me);
  const [tab, setTab] = React.useState<"chat" | "lists">(readTab);
  const pickTab = (t: "chat" | "lists") => {
    setTab(t);
    try {
      window.localStorage.setItem(TAB_KEY, t);
    } catch {
      /* UI preference only */
    }
  };
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const profiles = React.useMemo<UserProfileLookup>(
    () =>
      ({
        [agentPubkey]: {
          avatarUrl,
          displayName: name,
          isAgent: true,
          name,
          nip05Handle: null,
          ownerPubkey: null,
        },
        // Your own messages: resolve your profile like the rest of the app (not the raw hex pubkey).
        ...(me
          ? {
              [me]: {
                avatarUrl: myProfile?.avatarUrl ?? null,
                displayName: myProfile?.displayName ?? null,
                isAgent: false,
                name: myProfile?.displayName ?? null,
                nip05Handle: myProfile?.nip05Handle ?? null,
                ownerPubkey: null,
              },
            }
          : {}),
      }) as unknown as UserProfileLookup,
    [
      agentPubkey,
      avatarUrl,
      name,
      me,
      myProfile?.avatarUrl,
      myProfile?.displayName,
      myProfile?.nip05Handle,
    ],
  );
  // The agent answers in a thread under each of your messages (its reply carries an `e` tag to your message), and
  // the channel query only returns top-level events. Like the desktop popover, fetch the replies for the recent
  // roots and show them inline; previously the web view dropped every tagged event, i.e. all agent replies.
  const rootIds = React.useMemo(
    () =>
      (events ?? [])
        .filter((e) => !e.tags?.some((t) => t[0] === "e"))
        .slice(-40)
        .map((e) => e.id),
    [events],
  );
  const threadReplies = useThreadRepliesForRoots(channel, rootIds);
  const merged = React.useMemo(() => {
    const base = events ?? [];
    return threadReplies.events.length
      ? threadReplies.events.reduce(mergeMessages, base)
      : base;
  }, [events, threadReplies.events]);
  // "Close Thread" (desktop parity): later opens start blank; earlier messages stay in the full conversation view.
  const [conversationStart, setConversationStart] = React.useState(() =>
    readConversationStart(me, agentPubkey),
  );
  React.useEffect(() => {
    setConversationStart(readConversationStart(me, agentPubkey));
  }, [me, agentPubkey]);
  const messages = React.useMemo<TimelineMessage[]>(() => {
    if (!channel) return [];
    return formatTimelineMessages(
      [...merged]
        .filter((e) => e.created_at > conversationStart)
        .sort((a, b) => a.created_at - b.created_at),
      channel,
      me,
      myProfile?.avatarUrl ?? null,
      profiles,
    )
      .filter(
        (m) =>
          m.kind === KIND_STREAM_MESSAGE || m.kind === KIND_STREAM_MESSAGE_V2,
      )
      .map((m) => ({ ...m, body: displayText(m.body ?? ""), depth: 0 }))
      .filter((m) => m.body)
      .slice(-80);
  }, [channel, merged, me, myProfile?.avatarUrl, profiles, conversationStart]);
  const mainEntries = React.useMemo(
    () => messages.map((message) => ({ message, summary: null })),
    [messages],
  );

  // Apply agent list fences from raw event content (displayText strips them from the transcript).
  const appliedFenceIds = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!me || !agentPubkey) return;
    for (const ev of merged) {
      if (!ev?.id || appliedFenceIds.current.has(ev.id)) continue;
      if ((ev.pubkey ?? "").toLowerCase() !== agentPubkey.toLowerCase())
        continue;
      const body = typeof ev.content === "string" ? ev.content : "";
      if (!body || !messageMayContainAssistantListFence(body)) {
        continue;
      }
      appliedFenceIds.current.add(ev.id);
      applyAssistantListFencesFromMessage(me, ev.id, body);
    }
  }, [merged, me, agentPubkey]);
  const tailKey = messages.at(-1)?.id ?? "";
  React.useLayoutEffect(() => {
    void tailKey;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [tailKey]);

  // The Assistant's messages you've seen here are read: advance the same synced read markers the channel view uses
  // (per-message for thread replies, the channel's top-level marker otherwise) so Inbox → Assistant doesn't show them
  // as unread. Only while the popup is open on the Chat tab and the page is visible.
  const chatShown = visible && (!tabbed || tab === "chat");
  const [pageVisible, setPageVisible] = React.useState(
    () =>
      typeof document === "undefined" || document.visibilityState === "visible",
  );
  React.useEffect(() => {
    const on = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  const markedSeen = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!chatShown || !pageVisible || !channel) return;
    const shownIds = new Set(messages.map((m) => m.id));
    const plan = planAssistantSeenReads(
      merged.filter((e) => shownIds.has(e.id)),
      agentPubkey,
      markedSeen.current,
    );
    for (const r of plan.replies) {
      markMessageRead(r.id, r.createdAt);
      if (r.rootId) markThreadRead(r.rootId, r.createdAt);
    }
    if (plan.topLevelAt !== null) {
      markChannelRead(
        channel.id,
        new Date(plan.topLevelAt * 1_000).toISOString(),
        {
          preserveForcedUnread: true,
          topLevelOnly: true,
        },
      );
    }
    for (const id of plan.ids) markedSeen.current.add(id);
  }, [
    chatShown,
    pageVisible,
    channel,
    messages,
    merged,
    agentPubkey,
    markChannelRead,
    markMessageRead,
    markThreadRead,
  ]);

  const [closeConfirm, setCloseConfirm] = React.useState(false);
  React.useEffect(() => {
    if (!closeConfirm) return;
    const t = window.setTimeout(
      () => setCloseConfirm(false),
      CLOSE_THREAD_CONFIRM_MS,
    );
    return () => window.clearTimeout(t);
  }, [closeConfirm]);
  React.useEffect(() => {
    if (!visible) setCloseConfirm(false);
  }, [visible]);
  // Same two-step as the desktop: first click arms "Confirm?", second ends the conversation and closes the popup.
  const onCloseThreadClick = () => {
    if (!closeConfirm) {
      setCloseConfirm(true);
      return;
    }
    const latest = merged.reduce((t, e) => Math.max(t, e.created_at), 0);
    const at = Math.max(Math.floor(Date.now() / 1000), latest);
    writeConversationStart(me, agentPubkey, at);
    setConversationStart(at);
    nextDraft("");
    setError(null);
    setCloseConfirm(false);
    onMinimize();
  };

  const sendMessage = async (
    content: string,
    mentionPubkeys: string[],
    mediaTags?: string[][],
  ) => {
    const text = content.trim();
    if ((!text && !mediaTags?.length) || busy || !me) return;
    // Typing a routine's name ("Wake the bots") runs it instead of sending it as chat.
    if (!mediaTags?.length && tryRunRoutineByName(text, me)) return;
    setBusy(true);
    setError(null);
    try {
      let target = channel;
      if (!target) {
        target = await openDm.mutateAsync({
          pubkeys: [agentPubkey],
          ...(activeCommunity?.relayUrl
            ? { expectedRelayUrl: activeCommunity.relayUrl }
            : {}),
          expectedSignerPubkey: me,
        });
        setCreated(target);
      }
      const ev = await send.mutateAsync({
        content: `${text}${assistantListTurnHint()}`,
        targetChannel: target,
        channelId: target.id,
        mentionPubkeys,
        ...(mediaTags?.length ? { mediaTags } : {}),
      });
      if (ev?.id) applyWebUserIntents(me, ev.id, text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send.");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-3"
      data-testid="web-assistant-popover"
    >
      <div className="flex shrink-0 items-center gap-2">
        <div
          className="flex min-w-0 items-center gap-2.5"
          data-testid="web-assistant-identity"
        >
          <div aria-hidden="true" className="relative shrink-0">
            <UserAvatar
              avatarUrl={avatarUrl}
              className="h-8 w-8"
              displayName={name}
              fallbackDelayMs={0}
              size="sm"
            />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-popover">
              <PresenceDot className="h-2 w-2" status={presence} />
            </span>
          </div>
          <span className="min-w-0 truncate text-sm font-medium">{name}</span>
          <span className="sr-only">{presence}</span>
        </div>
        {tabbed ? (
          <div
            className="grid h-8 shrink-0 auto-cols-fr grid-flow-col items-stretch gap-0.5 rounded-md bg-muted/45 p-0.5"
            data-slot="segmented-control"
            data-testid="web-assistant-tabs"
            role="tablist"
          >
            {(["chat", "lists"] as const).map((t) => (
              <button
                aria-selected={tab === t}
                className={cn(
                  "relative flex h-full min-w-14 items-center justify-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors duration-150 ease-out focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  tab === t
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`web-assistant-tab-${t}`}
                key={t}
                onClick={() => pickTab(t)}
                role="tab"
                type="button"
              >
                {t === "chat" ? "Chat" : "Lists"}
                {t === "lists" && summary.dueReminders > 0 ? (
                  <span
                    className="min-w-4 rounded-full bg-destructive px-1 text-2xs leading-4 text-destructive-foreground tabular-nums"
                    data-testid="web-assistant-tab-lists-badge"
                  >
                    {summary.dueReminders}
                    <span className="sr-only"> due</span>
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex-1" />
        {managed && presence === "offline" ? (
          <Button
            className="h-7 rounded-full border border-border/50 bg-muted/45 px-2.5 text-xs font-medium text-foreground shadow-none hover:bg-muted/70"
            data-testid="web-assistant-start"
            disabled={!directLive || starting}
            onClick={() => void start()}
            size="xs"
            title={
              directLive
                ? "Start on your desktop"
                : "Needs Direct (your desktop connected)"
            }
            type="button"
            variant="ghost"
          >
            {starting
              ? "Starting…"
              : directLive
                ? "Start"
                : "Start · Needs Direct"}
          </Button>
        ) : null}
        {messages.length > 0 ? (
          <Button
            aria-label={closeConfirm ? "Confirm close thread" : "Close Thread"}
            className={
              closeConfirm
                ? "h-7 shrink-0 rounded-full px-2.5 text-xs font-medium shadow-none"
                : "h-7 shrink-0 rounded-full border border-border/50 bg-muted/45 px-2.5 text-xs font-medium text-foreground shadow-none hover:bg-muted/70"
            }
            data-testid="web-assistant-close-thread"
            onClick={onCloseThreadClick}
            size="xs"
            type="button"
            variant={closeConfirm ? "destructive" : "ghost"}
          >
            {closeConfirm ? "Confirm?" : "Close Thread"}
          </Button>
        ) : null}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            aria-label="Open Assistant conversation"
            data-testid="web-assistant-open"
            onClick={() => onOpenConversation(channel)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <SquareArrowOutUpRight />
          </Button>
          <Button
            aria-label="Close Assistant"
            className="h-9 w-9 rounded-full bg-muted/70 text-foreground hover:bg-muted [&_svg]:size-5 max-sm:h-11 max-sm:w-11 max-sm:[&_svg]:size-6"
            data-testid="web-assistant-minimize"
            onClick={onMinimize}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ChevronDown />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-3",
          tabbed && tab !== "chat" && "hidden",
        )}
        role={tabbed ? "tabpanel" : undefined}
      >
        <NudgeBanner me={me} />

        {channel && messages.length > 0 ? (
          <div
            aria-live="polite"
            className="min-h-0 flex-1 overflow-y-auto"
            data-testid="web-assistant-transcript"
            ref={transcriptRef}
          >
            <div className="flex min-h-0 flex-col gap-2 pb-3">
              <TimelineMessageList
                channelId={channel.id}
                channelName={channel.name}
                channelType={channel.channelType}
                currentPubkey={me}
                mainEntries={mainEntries}
                messages={messages}
                onToggleReaction={async (message, emoji, remove) => {
                  await toggleReaction.mutateAsync({
                    emoji,
                    eventId: message.id,
                    remove,
                  });
                }}
                profiles={profiles}
                stickyDayDividers={false}
              />
              {showActivity && activityItems.length > 0 ? (
                <div className="px-1" data-testid="web-assistant-activity">
                  <AgentSessionTranscriptList
                    agentAvatarUrl={avatarUrl}
                    agentName={name}
                    agentPubkey={agentPubkey}
                    autoTail={false}
                    channelId={channel.id}
                    emptyDescription="Activity will appear here while Assistant works."
                    items={activityItems}
                    profiles={profiles}
                    variant="compactPreview"
                  />
                </div>
              ) : null}
              <div aria-hidden="true" ref={bottomRef} />
            </div>
          </div>
        ) : (
          <div aria-hidden="true" className="min-h-16 flex-1" />
        )}

        {/* In-flow under the input (channel views reserve a composer-dock rail; Assist has no overlay dock,
            so absolute ComposerActivityAccessory was painting over / above the box). */}
        <div className="relative shrink-0">
          <div
            data-testid="web-assistant-input"
            onFocusCapture={() => {
              // iOS keyboard: once the popup has resized to the visual viewport, keep the latest message in view.
              for (const ms of [50, 350]) {
                window.setTimeout(() => {
                  const el = transcriptRef.current;
                  if (el) el.scrollTop = el.scrollHeight;
                }, ms);
              }
            }}
            ref={composerBoxRef}
          >
            <MessageComposer
              channelId={channel?.id ?? null}
              channelName={name}
              channelType={channel?.channelType ?? "dm"}
              containerClassName="px-0 pb-0"
              disabled={!me}
              draftKey={draftKey}
              isSending={busy}
              layoutMode="standalone"
              onSend={sendMessage}
              placeholder={`Message ${name}`}
              profiles={profiles}
              showBackgroundUploadProgress={false}
              showTopBorder={false}
            />
          </div>
          {/* Fixed-height slot, always present: the typing line fades in/out without shifting the composer or chat. */}
          <div
            className="my-0.5 flex h-4 w-full items-center pl-2 pr-1 text-xs leading-4"
            data-testid="web-assistant-typing-slot"
          >
            {typingPubkeys.length > 0 && channel ? (
              <div
                className="flex min-w-0 flex-1"
                data-testid="web-assistant-typing"
              >
                <TypingIndicatorRow
                  channel={channel}
                  className="min-w-0 flex-1 py-0"
                  currentPubkey={me}
                  profiles={profiles}
                  typingPubkeys={typingPubkeys}
                />
              </div>
            ) : null}
          </div>
        </div>
        {error ? (
          <p className="shrink-0 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {tabbed ? (
        tab === "lists" ? (
          <div className="flex min-h-0 flex-1 flex-col" role="tabpanel">
            <AssistantListsCard me={me} onNavigate={onMinimize} tabbed />
          </div>
        ) : null
      ) : (
        <AssistantListsCard me={me} onNavigate={onMinimize} />
      )}
    </div>
  );
}

function NudgeBanner({ me }: { me: string | undefined }) {
  const due = useSuiteSummary(me).dueReminders;
  if (!due) return null;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs",
      )}
      data-testid="web-assistant-nudge"
    >
      <Bell className="size-3.5 shrink-0 text-amber-600" />
      <span className="min-w-0 flex-1 truncate">
        {due} reminder{due === 1 ? "" : "s"} due — open Lists › Reminders
      </span>
    </div>
  );
}

const TAB_KEY = "buzz-assistant-popover-tab.v1";
function readTab(): "chat" | "lists" {
  try {
    return window.localStorage.getItem(TAB_KEY) === "lists" ? "lists" : "chat";
  } catch {
    return "chat";
  }
}
// iPhone + iPad (touch/tablet widths) get Chat/Lists tabs; desktop-width web keeps the desktop expansion card.
const TABBED_QUERY = "(max-width: 1023px), (pointer: coarse)";
function useTabbedLayout(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(TABBED_QUERY);
      mq?.addEventListener("change", cb);
      return () => mq?.removeEventListener("change", cb);
    },
    () => Boolean(window.matchMedia?.(TABBED_QUERY).matches),
    () => false,
  );
}
