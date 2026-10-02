import type {
  Channel,
  ChannelVisibility,
  CreateChannelInput,
} from "@/shared/api/types";

/** Non-archived channels whose name matches exactly, including case. */
export function exactNamedChannels(
  channels: readonly Channel[],
  name: string,
): Channel[] {
  return channels.filter(
    (channel) => channel.archivedAt === null && channel.name === name,
  );
}

/**
 * Reuse one exact channel, create it, or stop when the name is ambiguous.
 * A reused channel keeps its visibility. A new channel uses `visibility`.
 */
export async function ensureNamedChannel(input: {
  channels: readonly Channel[];
  createChannel: (input: CreateChannelInput) => Promise<Channel>;
  description?: string;
  joinChannel: (channelId: string) => Promise<void>;
  name: string;
  resume: Map<string, Channel>;
  resumeKey: string;
  visibility: ChannelVisibility;
}): Promise<Channel> {
  const cached = input.resume.get(input.resumeKey);
  if (cached) return cached;

  const matches = exactNamedChannels(input.channels, input.name);
  if (matches.length > 1) {
    throw new Error(`More than one channel is named "${input.name}".`);
  }

  let channel = matches[0];
  if (!channel) {
    channel = await input.createChannel({
      channelType: "stream",
      description: input.description,
      name: input.name,
      visibility: input.visibility,
    });
  } else if (!channel.isMember) {
    await input.joinChannel(channel.id);
    channel = { ...channel, isMember: true };
  }

  input.resume.set(input.resumeKey, channel);
  return channel;
}
