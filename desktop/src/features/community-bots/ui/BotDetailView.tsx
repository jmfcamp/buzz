import * as React from "react";
import { toast } from "sonner";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useChannelsQuery, useOpenDmMutation } from "@/features/channels/hooks";
import {
  useCommunityBotsQuery,
  useCommunityBotsStatusQuery,
} from "@/features/community-bots/hooks";
import {
  communityBotDirectoryDetail,
  findCommunityDirectoryBot,
  visibleCommunityDirectoryBots,
} from "@/features/community-bots/lib/directory";
import {
  BotDetailContent,
  type BotPingState,
} from "@/features/community-bots/ui/BotsDirectoryPanels";
import {
  useMyRelayMembershipLookupQuery,
  useRelayMembersQuery,
} from "@/features/community-members/hooks";
import { awaitPingOutcome, PING_TIMEOUT_MS } from "@/features/agents/lib/pingOutcome";
import { subscribeControlResults } from "@/features/agents/observerRelayStore";
import { useDirectLive } from "@/features/assistantData/dataStore";
import { isWebBuild } from "@/features/bridge/ui/DesktopData";
import { pingManagedAgent } from "@/shared/api/agentControl";
import { useIdentityQuery } from "@/shared/api/hooks";
import { canManageCommunityMembers } from "@/shared/api/relayMembers";
import { useIsArchivedPredicate } from "@/features/identity-archive/hooks";
import { usePresenceQuery } from "@/features/presence/hooks";
import { useUserProfileQuery } from "@/features/profile/hooks";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { IdentityCardSkeleton } from "@/shared/ui/identity-card-skeleton";

type BotDetailViewProps = {
  botId: string;
  onClose: () => void;
  onOpenChannel: (channelId: string) => void;
};

export function BotDetailView({
  botId,
  onClose,
  onOpenChannel,
}: BotDetailViewProps) {
  const catalogQuery = useCommunityBotsQuery();
  const statusQuery = useCommunityBotsStatusQuery();
  const channelsQuery = useChannelsQuery();
  const membersQuery = useRelayMembersQuery();
  const isArchived = useIsArchivedPredicate();
  const { goChannel } = useAppNavigation();
  const openDmMutation = useOpenDmMutation();
  const [messagePending, setMessagePending] = React.useState(false);
  const [pingState, setPingState] = React.useState<BotPingState>({
    kind: "idle",
  });
  const myPubkey = useIdentityQuery().data?.pubkey;
  const myMembershipQuery = useMyRelayMembershipLookupQuery();
  const directLive = useDirectLive();
  const isMountedRef = React.useRef(false);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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

  const handleMessage = React.useCallback(() => {
    if (!bot || messagePending) return;

    setMessagePending(true);
    void (async () => {
      try {
        const dm = await openDmMutation.mutateAsync({
          pubkeys: [bot.pubkey],
        });
        await goChannel(dm.id);
        if (isMountedRef.current) {
          onClose();
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Couldn't open the direct message.",
        );
      } finally {
        if (isMountedRef.current) {
          setMessagePending(false);
        }
      }
    })();
  }, [bot, goChannel, messagePending, onClose, openDmMutation]);

  // Owner-only: the bridge only honors control frames signed by its owner, and
  // telemetry replies are encrypted to the owner. When the profile names an
  // owner, require it to be me; otherwise fall back to community owner/admin.
  const profileOwner = profileQuery.data?.ownerPubkey ?? null;
  const canPing = Boolean(
    bot &&
      myPubkey &&
      (profileOwner
        ? normalizePubkey(profileOwner) === normalizePubkey(myPubkey)
        : canManageCommunityMembers(myMembershipQuery.data)),
  );
  // Web decrypts the pong through the paired desktop (Direct); without it the
  // reply can't be read, so the button is disabled rather than timing out.
  const pingUnavailableReason =
    isWebBuild() && !directLive ? "Needs Direct (desktop) to read the reply" : null;

  // Ping result belongs to one bot: reset when the profile switches, and drop late outcomes from the previous bot.
  const botPubkey = bot?.pubkey ?? null;
  const pingBotRef = React.useRef(botPubkey);
  React.useEffect(() => {
    pingBotRef.current = botPubkey;
    setPingState({ kind: "idle" });
  }, [botPubkey]);

  const handlePing = React.useCallback(() => {
    if (!bot || pingState.kind === "pending") return;
    const requestId = crypto.randomUUID();
    const pingedPubkey = bot.pubkey;
    const stillCurrent = () => isMountedRef.current && pingBotRef.current === pingedPubkey;
    setPingState({ kind: "pending" });
    void awaitPingOutcome({
      requestId,
      subscribe: (listener) => subscribeControlResults(bot.pubkey, listener),
      sendPing: () => pingManagedAgent(bot.pubkey, requestId),
      scheduleTimeout: (onTimeout) => {
        const id = window.setTimeout(onTimeout, PING_TIMEOUT_MS);
        return () => window.clearTimeout(id);
      },
      now: () => performance.now(),
    })
      .then((outcome) => {
        if (!stillCurrent()) return;
        setPingState(
          outcome.kind === "up"
            ? { kind: "up", ms: outcome.ms }
            : { kind: "timeout" },
        );
      })
      .catch((error) => {
        if (!stillCurrent()) return;
        setPingState({ kind: "idle" });
        toast.error(
          error instanceof Error ? error.message : "Couldn't send the ping.",
        );
      });
  }, [bot, pingState.kind]);

  const isLoading =
    catalogQuery.isLoading ||
    (bot !== undefined &&
      profileQuery.isLoading &&
      profileQuery.data === undefined);

  if (isLoading) {
    return <IdentityCardSkeleton />;
  }

  if (!bot) {
    return (
      <p
        className="pt-4 text-sm text-muted-foreground"
        data-testid="bot-detail-missing"
      >
        This community bot is not installed, or it has been archived.
      </p>
    );
  }

  if (!detail) {
    return null;
  }

  return (
    <BotDetailContent
      detail={detail}
      messagePending={messagePending}
      onMessage={handleMessage}
      onOpenChannel={onOpenChannel}
      onPing={canPing ? handlePing : undefined}
      pingState={pingState}
      pingUnavailableReason={pingUnavailableReason}
    />
  );
}
