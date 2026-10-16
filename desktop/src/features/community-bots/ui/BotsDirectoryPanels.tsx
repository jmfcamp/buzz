import { Activity, ArrowUpRight, CheckCircle2, MessageSquare, XCircle } from "lucide-react";

import { UsageAndActivityButton } from "@/features/agents/ui/AgentUsageActivityPanel";

import { AgentIdentityCard } from "@/features/agents/ui/AgentIdentityCard";
import { AgentRuntimeAvatarControl } from "@/features/agents/ui/AgentRuntimeAvatarControl";
import type { PresenceStatus } from "@/shared/api/types";
import { IDENTITY_CARD_GRID_CLASS } from "@/features/agents/ui/UnifiedAgentsSection";
import {
  communityBotCardSubtitle,
  communityBotDirectoryChannelLink,
  type CommunityBotDirectoryCard,
  type CommunityBotDirectoryDetail,
} from "@/features/community-bots/lib/directory";
import { ProfileHeroAvatar } from "@/features/profile/ui/UserProfilePanelSections";
import { ProfileSectionGroup } from "@/features/profile/ui/UserProfilePanelFields";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PubKey } from "@/shared/ui/PubKey";
import { Spinner } from "@/shared/ui/spinner";

export function BotsEmptyState({
  onOpenSettings,
}: {
  onOpenSettings: () => void;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed border-border/80 px-6 py-12 text-center"
      data-testid="bots-empty-state"
    >
      <p className="text-base font-medium text-foreground">
        No community bots yet
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Install them in Settings → Communities → Bots.
      </p>
      <Button
        className="mt-5"
        data-testid="bots-empty-open-settings"
        onClick={onOpenSettings}
        size="sm"
        type="button"
        variant="outline"
      >
        Open Bots settings
      </Button>
    </div>
  );
}

function botAvailability(statusId: string): PresenceStatus {
  return statusId === "online" || statusId === "away" ? statusId : "offline";
}

export function BotsDirectoryGrid({
  cards,
  onOpenBot,
}: {
  cards: readonly CommunityBotDirectoryCard[];
  onOpenBot: (botId: string) => void;
}) {
  return (
    <div className={IDENTITY_CARD_GRID_CLASS} data-testid="bots-directory">
      {cards.map((card) => (
        <AgentIdentityCard
          ariaLabel={`Open ${card.name}`}
          avatar={
            // Same portrait as a local agent card: rounded-square avatar with the presence dot cut into its
            // bottom-right corner. Bots have no local runtime, so it is always in the status-dot state (no Start).
            <AgentRuntimeAvatarControl
              activeTestId={`bot-card-${card.id}-status-dot`}
              availability={botAvailability(card.status.id)}
              avatarUrl={card.avatarUrl}
              isActive
              isStarting={false}
              label={card.name}
              onStart={() => {}}
              startTestId={`bot-card-${card.id}-start`}
            />
          }
          avatarIsControl={false}
          dataTestId={`bot-card-${card.id}`}
          key={card.id}
          label={card.name}
          subtitle={communityBotCardSubtitle(card)}
          onClick={() => onOpenBot(card.id)}
        />
      ))}
    </div>
  );
}

export type BotPingState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "up"; ms: number }
  | { kind: "timeout" };

const PRIMARY_ACTION_CLASS =
  "flex min-h-20 w-full flex-col items-center justify-center gap-1.5 rounded-xl bg-muted px-2 py-3 text-center transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function BotPingButton({
  onPing,
  state,
  unavailableReason,
}: {
  onPing: () => void;
  state: BotPingState;
  unavailableReason: string | null;
}) {
  const pending = state.kind === "pending";
  let icon = <Activity className="h-5 w-5 text-foreground" />;
  let label = "Ping";
  if (pending) {
    icon = <Spinner aria-hidden="true" className="h-5 w-5 border-2" />;
    label = "Pinging…";
  } else if (state.kind === "up") {
    icon = <CheckCircle2 className="h-5 w-5 text-green-600" />;
    label = `Up, ${state.ms} ms`;
  } else if (state.kind === "timeout") {
    icon = <XCircle className="h-5 w-5 text-red-600" />;
    label = "Not responding";
  }
  return (
    <button
      aria-busy={pending || undefined}
      aria-label="Ping"
      className={PRIMARY_ACTION_CLASS}
      data-ping-state={state.kind}
      data-testid="bot-detail-ping"
      disabled={pending || unavailableReason !== null}
      onClick={onPing}
      title={
        unavailableReason ??
        (state.kind === "timeout"
          ? "No reply in 10s — the bridge may need an update"
          : "Check the bot's bridge is up")
      }
      type="button"
    >
      {icon}
      <span
        className={`min-w-0 text-xs font-medium leading-tight ${state.kind === "up" ? "text-green-600" : state.kind === "timeout" ? "text-red-600" : ""}`}
      >
        {label}
      </span>
      {state.kind === "timeout" ? (
        <span className="min-w-0 text-[10px] leading-tight text-red-600/80">
          bridge may need update
        </span>
      ) : null}
    </button>
  );
}

export function BotDetailContent({
  detail,
  messagePending = false,
  onMessage,
  onOpenChannel,
  onPing,
  pingState,
  pingUnavailableReason,
}: {
  detail: CommunityBotDirectoryDetail;
  messagePending?: boolean;
  onMessage?: () => void;
  onOpenChannel: (channelId: string) => void;
  onPing?: () => void;
  pingState?: BotPingState;
  pingUnavailableReason?: string | null;
}) {
  const channelLinks = detail.channels.map(communityBotDirectoryChannelLink);

  return (
    <div className="flex flex-col gap-6 pt-8" data-testid="bot-detail-content">
      <div className="flex flex-col items-center gap-3 text-center">
        {/*
          Sized outer span + extra top padding keep the hero avatar fully
          visible under the overlapping Profile header (overflow clips shadows
          / borders when the avatar sits flush with the scroll edge).
        */}
        <span className="inline-flex shrink-0" data-testid="bot-detail-avatar">
          {/* The exact hero avatar a local agent's profile renders (same component, size, mask, image source). */}
          <ProfileHeroAvatar
            avatarUrl={detail.avatarUrl}
            displayName={detail.name}
            isBot
            presenceStatus={
              detail.status.id === "online" || detail.status.id === "away" || detail.status.id === "offline"
                ? detail.status.id
                : undefined
            }
            pubkey={detail.hexPubkey}
          />
        </span>
        <div className="flex max-w-full flex-col items-center gap-1">
          <h2
            className="truncate text-xl font-semibold tracking-tight"
            data-testid="bot-detail-name"
          >
            {detail.name}
          </h2>
          <Badge data-testid="bot-detail-status" variant="secondary">
            {detail.status.label}
          </Badge>
          {detail.description ? (
            <p
              className="max-w-full px-2 text-center whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground"
              data-testid="bot-detail-description"
            >
              {detail.description}
            </p>
          ) : null}
        </div>
      </div>

      {onMessage || onPing ? (
        <div
          className="grid grid-flow-col auto-cols-fr gap-2"
          data-testid="bot-detail-primary-actions"
        >
          <button
            aria-busy={messagePending || undefined}
            aria-label="Message"
            className="flex min-h-20 w-full flex-col items-center justify-center gap-1.5 rounded-xl bg-muted px-2 py-3 text-center transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="bot-detail-message"
            disabled={messagePending}
            onClick={onMessage}
            type="button"
          >
            {messagePending ? (
              <Spinner aria-hidden="true" className="h-5 w-5 border-2" />
            ) : (
              <MessageSquare className="h-5 w-5 text-foreground" />
            )}
            <span className="min-w-0 text-xs font-medium leading-tight">
              Message
            </span>
          </button>
          {onPing ? (
            <BotPingButton
              onPing={onPing}
              state={pingState ?? { kind: "idle" }}
              unavailableReason={pingUnavailableReason ?? null}
            />
          ) : null}
        </div>
      ) : null}

      <UsageAndActivityButton
        agentName={detail.name}
        agentPubkey={detail.hexPubkey}
        className="w-full justify-start gap-2 border border-border/60 px-3 py-2 text-xs font-medium"
        label="Usage & activity"
        size="sm"
        testId={`bot-detail-usage-activity-${detail.hexPubkey}`}
        variant="ghost"
      />

      <ProfileSectionGroup testId="bot-detail-public-key" title="Identity">
        <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">Public key</p>
            <PubKey pubkey={detail.hexPubkey} testId="bot-detail-pubkey" />
          </div>
        </div>
      </ProfileSectionGroup>

      <ProfileSectionGroup testId="bot-detail-channels" title="Channels">
        {channelLinks.length === 0 ? (
          <p
            className="px-4 py-3 text-sm leading-6 text-muted-foreground"
            data-testid="bot-detail-channels-empty"
          >
            This bot is not a member of any channels.
          </p>
        ) : (
          <ul
            className="divide-y divide-border/55"
            data-testid="bot-detail-channels-list"
          >
            {channelLinks.map((channel) => (
              <li key={channel.id}>
                <button
                  aria-label={channel.ariaLabel}
                  className="group flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
                  data-testid={`bot-detail-channel-${channel.id}`}
                  onClick={() => onOpenChannel(channel.id)}
                  type="button"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {channel.label}
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </ProfileSectionGroup>
    </div>
  );
}
