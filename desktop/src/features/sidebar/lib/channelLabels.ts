import { formatDmParticipantDisplayName } from "@/features/channels/lib/dmParticipantDisplay";
import type { CommunityBot } from "@/features/community-bots/lib/types";
import {
  resolveUserLabel,
  type UserProfileLookup,
} from "@/features/profile/lib/identity";
import type { Channel } from "@/shared/api/types";

function isGenericDmChannelName(name: string | null | undefined) {
  const normalized = (name ?? "").trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "dm" ||
    normalized === "direct message" ||
    normalized === "direct messages" ||
    /^group dm\s*(\(\d+\))?$/.test(normalized)
  );
}

export function resolveChannelDisplayLabel(
  channel: Channel,
  currentPubkey: string | undefined,
  profiles: UserProfileLookup | undefined,
  communityBots?: ReadonlyArray<CommunityBot>,
) {
  // Channel references from the warm directory / reminders can be partial
  // (missing name or participant arrays); never throw while labeling.
  const channelName = channel.name ?? "";
  if (channel.channelType !== "dm" || !isGenericDmChannelName(channelName)) {
    return channelName;
  }

  const participants = (channel.participantPubkeys ?? []).map((pubkey, index) => ({
    fallbackName: channel.participants?.[index] ?? null,
    pubkey,
  }));
  const otherParticipants = currentPubkey
    ? participants.filter(
        (participant) =>
          participant.pubkey.toLowerCase() !== currentPubkey.toLowerCase(),
      )
    : participants;
  const resolvedLabels = (
    otherParticipants.length > 0 ? otherParticipants : participants
  ).map((participant) =>
    resolveUserLabel({
      communityBots,
      currentPubkey,
      fallbackName: participant.fallbackName,
      profiles,
      pubkey: participant.pubkey,
    }),
  );
  const uniqueLabels = [...new Set(resolvedLabels)];

  return uniqueLabels.length > 0
    ? formatDmParticipantDisplayName(
        uniqueLabels.map((displayName) => ({ displayName })),
      )
    : channelName;
}
