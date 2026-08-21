import * as React from "react";

import { useChannelsQuery } from "@/features/channels/hooks";
import {
  useCommunityBotsQuery,
  useCommunityBotsStatusQuery,
} from "@/features/community-bots/hooks";
import {
  communityBotDirectoryDetail,
  findCommunityDirectoryBot,
  visibleCommunityDirectoryBots,
} from "@/features/community-bots/lib/directory";
import { BotDetailContent } from "@/features/community-bots/ui/BotsDirectoryPanels";
import { useRelayMembersQuery } from "@/features/community-members/hooks";
import { useIsArchivedPredicate } from "@/features/identity-archive/hooks";
import { usePresenceQuery } from "@/features/presence/hooks";
import { useUserProfileQuery } from "@/features/profile/hooks";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { IdentityCardSkeleton } from "@/shared/ui/identity-card-skeleton";

type BotDetailViewProps = {
  botId: string;
  onBack: () => void;
  onOpenChannel: (channelId: string) => void;
};

export function BotDetailView({
  botId,
  onBack,
  onOpenChannel,
}: BotDetailViewProps) {
  const catalogQuery = useCommunityBotsQuery();
  const statusQuery = useCommunityBotsStatusQuery();
  const channelsQuery = useChannelsQuery();
  const membersQuery = useRelayMembersQuery();
  const isArchived = useIsArchivedPredicate();

  const visibleBots = React.useMemo(
    () => visibleCommunityDirectoryBots(catalogQuery.data ?? [], isArchived),
    [catalogQuery.data, isArchived],
  );
  const bot = findCommunityDirectoryBot(visibleBots, botId);
  const profileQuery = useUserProfileQuery(bot?.pubkey);
  const presenceQuery = usePresenceQuery(bot ? [bot.pubkey] : [], {
    enabled: Boolean(bot),
  });

  const isRelayMember = React.useMemo(() => {
    if (!bot || membersQuery.data === undefined) return null;
    const pubkey = normalizePubkey(bot.pubkey);
    return membersQuery.data.some(
      (member) => normalizePubkey(member.pubkey) === pubkey,
    );
  }, [bot, membersQuery.data]);

  const detail = React.useMemo(() => {
    if (!bot) return null;
    const presence = presenceQuery.data?.[normalizePubkey(bot.pubkey)] ?? null;
    return communityBotDirectoryDetail({
      bot,
      channels: channelsQuery.data ?? [],
      gatewayState: statusQuery.data?.state,
      isRelayMember,
      presence,
      profile: profileQuery.data,
    });
  }, [
    bot,
    channelsQuery.data,
    isRelayMember,
    presenceQuery.data,
    profileQuery.data,
    statusQuery.data?.state,
  ]);

  const isLoading =
    catalogQuery.isLoading ||
    (bot !== undefined &&
      profileQuery.isLoading &&
      profileQuery.data === undefined);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-7 sm:px-6 sm:py-8">
      <div
        className="mx-auto w-full max-w-3xl space-y-8"
        data-testid="bot-detail-page"
      >
        {isLoading ? <IdentityCardSkeleton /> : null}

        {!isLoading && !bot ? (
          <div className="space-y-3">
            <button
              className="text-sm text-primary underline-offset-4 hover:underline"
              data-testid="bot-detail-missing-back"
              onClick={onBack}
              type="button"
            >
              Back to Bots
            </button>
            <p
              className="text-sm text-muted-foreground"
              data-testid="bot-detail-missing"
            >
              This community bot is not installed, or it has been archived.
            </p>
          </div>
        ) : null}

        {!isLoading && detail ? (
          <BotDetailContent
            detail={detail}
            onBack={onBack}
            onOpenChannel={onOpenChannel}
          />
        ) : null}
      </div>
    </div>
  );
}
