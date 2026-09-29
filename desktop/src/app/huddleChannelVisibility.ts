import type { Channel } from "@/shared/api/types";

const HUDDLE_NAME_SUFFIX = /\s+huddle$/i;
const HUDDLE_FALLBACK_NAME = /^huddle-[0-9a-f]{8}$/i;

type HuddleChannelShape = Pick<
  Channel,
  "id" | "name" | "ttlSeconds" | "channelType"
>;

/**
 * Huddle backing channels are ephemeral (TTL) streams named like
 * "parent huddle" or the create-fallback `huddle-<8 hex>`. Permanent
 * channels that happen to include "huddle" in the name stay ordinary.
 */
export function looksLikeHuddleBackingChannel(
  channel: HuddleChannelShape,
): boolean {
  if (channel.channelType === "forum") return false;
  if (channel.ttlSeconds === null) return false;
  const name = channel.name.trim();
  return HUDDLE_NAME_SUFFIX.test(name) || HUDDLE_FALLBACK_NAME.test(name);
}

export function isHuddleBackingChannel(
  channel: HuddleChannelShape,
  huddleBackingChannelIds: ReadonlySet<string>,
): boolean {
  return (
    huddleBackingChannelIds.has(channel.id) ||
    looksLikeHuddleBackingChannel(channel)
  );
}

export function isLiveHuddleSidebarChannel(
  channelId: string,
  revealedHuddleChannelIds: ReadonlySet<string>,
  activeHuddleChannelId: string | null | undefined,
): boolean {
  return (
    revealedHuddleChannelIds.has(channelId) ||
    channelId === activeHuddleChannelId
  );
}

/**
 * Primary left-nav lists (Channels, sections, starred): show ordinary
 * channels and explicitly revealed live huddle transcripts. Live companion
 * huddles stay hidden here; ended ones belong in Archived Huddles.
 */
export function shouldShowSidebarChannel(
  channel: HuddleChannelShape,
  huddleBackingChannelIds: ReadonlySet<string>,
  revealedHuddleChannelIds: ReadonlySet<string>,
): boolean {
  return (
    !isHuddleBackingChannel(channel, huddleBackingChannelIds) ||
    revealedHuddleChannelIds.has(channel.id)
  );
}

/**
 * Ended / abandoned huddle child channels for the "Archived Huddles" section.
 * Keeps transcripts reachable without cluttering Channels. Live sessions
 * (active or revealed) are excluded.
 */
export function isArchivedHuddleSidebarChannel(
  channel: HuddleChannelShape,
  huddleBackingChannelIds: ReadonlySet<string>,
  revealedHuddleChannelIds: ReadonlySet<string>,
  activeHuddleChannelId: string | null | undefined,
): boolean {
  if (!isHuddleBackingChannel(channel, huddleBackingChannelIds)) {
    return false;
  }
  return !isLiveHuddleSidebarChannel(
    channel.id,
    revealedHuddleChannelIds,
    activeHuddleChannelId,
  );
}

export function sortArchivedHuddleChannels(
  channels: readonly Channel[],
): Channel[] {
  return [...channels].sort((left, right) => {
    const leftAt = left.lastMessageAt ?? "";
    const rightAt = right.lastMessageAt ?? "";
    if (leftAt !== rightAt) return rightAt.localeCompare(leftAt);
    return left.name.localeCompare(right.name);
  });
}
