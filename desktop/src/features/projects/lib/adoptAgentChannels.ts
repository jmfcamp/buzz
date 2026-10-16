/**
 * Channels an agent creates "inside" a project are plain channels: the relay
 * create (kind:9007) carries no project, and the project announcement
 * (kind:30621) is owner-signed, so the agent cannot add itself to it. The
 * owner's app adopts them on its next sync / Repair project links: a live,
 * open channel named `<project channel name>_…` whose creator is the owner
 * or an agent the owner owns, and that the project does not link yet.
 */
export type AdoptableChannel = {
  id: string;
  name: string;
  createdBy: string;
  archivedAt: string | null;
};

export function findAdoptableProjectChannels(input: {
  projectChannelName: string;
  ownerPubkey: string;
  linkedChannelIds: ReadonlySet<string>;
  directory: readonly AdoptableChannel[];
  /** creator pubkey → owner pubkey (null for humans / unknown). */
  creatorOwners: ReadonlyMap<string, string | null>;
  /**
   * Explicit owner "Repair project links": the name prefix is enough. Agent
   * ownership is often not provable client-side (no NIP-OA tag on the agent's
   * profile, and the web directory reports the relay as creator), and the owner
   * is only linking a channel into their own record.
   */
  trustNamePrefix?: boolean;
}): string[] {
  const prefix = `${input.projectChannelName.trim().toLowerCase()}_`;
  if (prefix.length < 2) return [];
  const owner = input.ownerPubkey.trim().toLowerCase();
  return input.directory
    .filter((channel) => {
      if (channel.archivedAt !== null) return false;
      if (input.linkedChannelIds.has(channel.id)) return false;
      if (!channel.name.toLowerCase().startsWith(prefix)) return false;
      // `name (2)` style collision duplicates are never adopted.
      if (/\s\(\d+\)$/.test(channel.name)) return false;
      if (input.trustNamePrefix) return true;
      const creator = channel.createdBy.trim().toLowerCase();
      if (creator === owner) return true;
      return (input.creatorOwners.get(creator) ?? "").toLowerCase() === owner;
    })
    .map((channel) => channel.id)
    .sort();
}
