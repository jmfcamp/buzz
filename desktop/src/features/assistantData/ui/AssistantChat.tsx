// Web Assistant popover body: same layout/markup as the desktop Assistant popover — agent lockup header, nudge
// banner, mini transcript (TimelineMessageList), rounded composer with the round send button, and the "Lists"
// expansion card. Your DM with the Assistant goes over the relay (signer-only); typed list requests apply at once.
import {
  ArrowUp,
  Bell,
  ChevronDown,
  SquareArrowOutUpRight,
} from "lucide-react";
import * as React from "react";

import { useManagedAgentsQuery } from "@/features/agents/hooks";
import { useChannelsQuery, useOpenDmMutation } from "@/features/channels/hooks";
import { useCommunities } from "@/features/communities/useCommunities";
import { formatTimelineMessages } from "@/features/messages/lib/formatTimelineMessages";
import {
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
import { startManagedAgent } from "@/shared/api/tauriManagedAgents";
import type { Channel, RelayEvent } from "@/shared/api/types";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

import { useDirectLive } from "../dataStore";
import { applyWebUserIntents } from "../webIntents";
import { AssistantListsCard, useSuiteSummary } from "./AssistantSuite";

// Hide the Assistant's machine-readable action blocks (```<name>-list|job|scratch|coffee|thread …```) like the
// desktop transcript; their changes show up in Lists.
const ACTION_FENCE =
  /```[a-z]+-(?:list|lists|job|jobs|scratch|coffee|thread|threads)\b[\s\S]*?```/gi;

export function displayText(content: string) {
  return content
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
  onChange,
  onMinimize,
  onOpenConversation,
}: {
  agentPubkey: string;
  fallbackName?: string;
  fallbackAvatarUrl?: string | null;
  onChange: () => void;
  onClose?: () => void;
  onMinimize: () => void;
  onOpenConversation: (channel: Channel | null) => void;
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
  const [draft, setDraft] = React.useState("");
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
  const messages = React.useMemo<TimelineMessage[]>(() => {
    if (!channel) return [];
    const top = (events ?? []).filter(
      (e) => !e.tags?.some((t) => t[0] === "e"),
    );
    return formatTimelineMessages(
      top,
      channel,
      me,
      myProfile?.avatarUrl ?? null,
      profiles,
    )
      .filter(
        (m) =>
          m.kind === KIND_STREAM_MESSAGE || m.kind === KIND_STREAM_MESSAGE_V2,
      )
      .map((m) => ({ ...m, body: displayText(m.body ?? "") }))
      .filter((m) => m.body)
      .slice(-60);
  }, [channel, events, me, myProfile?.avatarUrl, profiles]);
  const mainEntries = React.useMemo(
    () => messages.map((message) => ({ message, summary: null })),
    [messages],
  );
  const tailKey = messages.at(-1)?.id ?? "";
  React.useLayoutEffect(() => {
    void tailKey;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [tailKey]);

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || busy || !me) return;
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
        content,
        targetChannel: target,
        channelId: target.id,
      });
      setDraft("");
      if (ev?.id) applyWebUserIntents(me, ev.id, content);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send.");
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Assistant options"
              className="flex min-w-0 items-center gap-2.5 rounded-md text-left outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="web-assistant-identity"
              type="button"
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
              <span className="min-w-0 truncate text-sm font-medium">
                {name}
              </span>
              <span className="sr-only">{presence}</span>
              <ChevronDown
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-[310]">
            <DropdownMenuItem
              data-testid="web-assistant-change"
              onSelect={onChange}
            >
              Change assistant…
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="web-assistant-remove"
              onSelect={onChange}
            >
              Remove assistant…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {tabbed ? (
          <div
            className="flex shrink-0 gap-0.5 rounded-full bg-muted/45 p-0.5"
            data-testid="web-assistant-tabs"
            role="tablist"
          >
            {(["chat", "lists"] as const).map((t) => (
              <button
                aria-selected={tab === t}
                className={cn(
                  "relative flex h-7 items-center justify-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors",
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
              <div aria-hidden="true" ref={bottomRef} />
            </div>
          </div>
        ) : (
          <div aria-hidden="true" className="min-h-16 flex-1" />
        )}

        <div className="relative shrink-0">
          <Textarea
            aria-label={`Message ${name}`}
            className="min-h-24 resize-none rounded-2xl pb-11"
            data-testid="web-assistant-input"
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
              void sendMessage();
            }}
            placeholder={`Message ${name}`}
            value={draft}
          />
          <Button
            aria-label="Send in Assistant conversation"
            className="absolute bottom-2 right-2 rounded-full"
            data-testid="web-assistant-send"
            disabled={!draft.trim() || busy}
            onClick={() => void sendMessage()}
            size="icon"
            type="button"
          >
            <ArrowUp />
          </Button>
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
