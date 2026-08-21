import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { AgentIdentityCard } from "@/features/agents/ui/AgentIdentityCard";
import { IdentityInitialsAvatar } from "@/features/agents/ui/IdentityInitialsAvatar";
import { IDENTITY_CARD_GRID_CLASS } from "@/features/agents/ui/UnifiedAgentsSection";
import type {
  CommunityBotDirectoryCard,
  CommunityBotDirectoryDetail,
} from "@/features/community-bots/lib/directory";
import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PubKey } from "@/shared/ui/PubKey";

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
          avatarUrl={card.avatarUrl}
          dataTestId={`bot-card-${card.id}`}
          key={card.id}
          label={card.name}
          onClick={() => onOpenBot(card.id)}
        />
      ))}
    </div>
  );
}

export function BotDetailContent({
  detail,
  onBack,
  onOpenChannel,
}: {
  detail: CommunityBotDirectoryDetail;
  onBack: () => void;
  onOpenChannel: (channelId: string) => void;
}) {
  return (
    <div className="space-y-8" data-testid="bot-detail-content">
      <div className="flex items-start gap-3">
        <Button
          aria-label="Back to Bots"
          data-testid="bot-detail-back"
          onClick={onBack}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronLeft />
        </Button>
        <PageHeader
          description="Read-only profile for this community bot."
          title={detail.name}
        />
      </div>

      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <div className="flex h-24 w-24 items-center justify-center">
          {detail.avatarUrl ? (
            <ProfileAvatar
              avatarUrl={detail.avatarUrl}
              className="h-full w-full border-[3px] border-background bg-muted shadow-none"
              iconClassName="h-8 w-8"
              label={detail.name}
            />
          ) : (
            <IdentityInitialsAvatar
              className="shadow-none"
              label={detail.name}
              size={96}
            />
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <h2
            className="truncate text-xl font-semibold"
            data-testid="bot-detail-name"
          >
            {detail.name}
          </h2>
          <Badge data-testid="bot-detail-status" variant="secondary">
            {detail.status.label}
          </Badge>
        </div>
      </div>

      {detail.description ? (
        <DetailRow label="Description" testId="bot-detail-description">
          <p className="text-sm text-foreground">{detail.description}</p>
        </DetailRow>
      ) : null}

      <DetailRow label="Public key" testId="bot-detail-public-key">
        <PubKey
          pubkey={detail.hexPubkey}
          testId="bot-detail-pubkey"
          variant="full"
        />
      </DetailRow>

      <DetailRow label="Status" testId="bot-detail-status-row">
        <p className="text-sm text-foreground">{detail.status.label}</p>
      </DetailRow>

      <DetailRow label="Channels" testId="bot-detail-channels">
        {detail.channels.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="bot-detail-channels-empty"
          >
            This bot is not a member of any channels.
          </p>
        ) : (
          <ul className="space-y-1.5" data-testid="bot-detail-channels-list">
            {detail.channels.map((channel) => (
              <li key={channel.id}>
                <button
                  className="text-sm text-primary underline-offset-4 hover:underline"
                  data-testid={`bot-detail-channel-${channel.id}`}
                  onClick={() => onOpenChannel(channel.id)}
                  type="button"
                >
                  #{channel.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DetailRow>
    </div>
  );
}

function DetailRow({
  children,
  label,
  testId,
}: {
  children: ReactNode;
  label: string;
  testId: string;
}) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  );
}
