import type { Channel } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

/**
 * Private stream used for Bestie Jobs + due-reminder agent notifies.
 *
 * Buzz ACP scopes provider sessions per channel (DMs are one Conversation
 * scope). Posting job/reminder turns into the Bestie DM shares that session's
 * in-flight turn with interactive chat — under Drop dedup the job is lost, and
 * under Queue/Steer it interrupts the chat turn.
 *
 * A dedicated private stream gives the same agent identity a **second
 * SessionScope**, so jobs/reminders can run in parallel with Bestie DM chat
 * without a second OS process or Kiingo-style sidecar agent.
 */
export const BESTIE_AUTONOMOUS_CHANNEL_NAME = "bestie-jobs";

export const BESTIE_AUTONOMOUS_CHANNEL_DESCRIPTION =
  "Bestie scheduled jobs and reminder notifies — parallel ACP session, separate from Bestie DM chat.";

export function normalizeBestieChannelName(name: string): string {
  return name
    .trim()
    .replace(/^#+/, "")
    .trim()
    .toLowerCase();
}

export function isBestieAutonomousChannelName(name: string): boolean {
  return (
    normalizeBestieChannelName(name) === BESTIE_AUTONOMOUS_CHANNEL_NAME
  );
}

function channelMemberPubkeys(channel: Channel): string[] {
  if (channel.memberPubkeys.length > 0) return channel.memberPubkeys;
  return channel.participantPubkeys;
}

export function channelIncludesPubkey(
  channel: Channel,
  pubkey: string,
): boolean {
  const want = normalizePubkey(pubkey);
  return channelMemberPubkeys(channel).some(
    (member) => normalizePubkey(member) === want,
  );
}

/**
 * Prefer the stored channel id when it still looks like the autonomous stream
 * and includes the Bestie agent; otherwise match by reserved name + membership.
 */
export function findBestieAutonomousChannel(
  channels: readonly Channel[],
  options: {
    agentPubkey: string;
    storedChannelId?: string | null;
  },
): Channel | null {
  const agentPubkey = normalizePubkey(options.agentPubkey);
  if (!agentPubkey) return null;

  const storedId = options.storedChannelId?.trim() || null;
  if (storedId) {
    const byId = channels.find((channel) => channel.id === storedId) ?? null;
    if (
      byId &&
      byId.channelType === "stream" &&
      channelIncludesPubkey(byId, agentPubkey)
    ) {
      return byId;
    }
  }

  return (
    channels.find(
      (channel) =>
        channel.channelType === "stream" &&
        channel.visibility === "private" &&
        isBestieAutonomousChannelName(channel.name) &&
        channelIncludesPubkey(channel, agentPubkey),
    ) ?? null
  );
}

/** True when `candidate` must not be used for interactive Bestie DM chat. */
export function isBestieAutonomousChannel(
  channel: Channel | null | undefined,
  agentPubkey: string | null | undefined,
): boolean {
  if (!channel || !agentPubkey) return false;
  if (channel.channelType !== "stream") return false;
  if (!isBestieAutonomousChannelName(channel.name)) return false;
  return channelIncludesPubkey(channel, agentPubkey);
}
