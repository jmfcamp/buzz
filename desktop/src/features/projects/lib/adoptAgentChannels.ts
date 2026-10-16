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

/** Tags `buzz channels create --project-home <uuid> --slug <slug>` puts on the kind:9007 create. */
export const PROJECT_HOME_TAG = "buzz-project-home";
export const PROJECT_SLUG_TAG = "buzz-project-slug";

/**
 * Slug channels created for this project (a new Hula-OS scope of work): the create event names this project's home
 * channel and a slug, and the channel name is `<project channel name>_[<stack>_]<slug>`. No creator proof needed: the
 * tag + exact name are the claim, and only the owner's app can sign it into the project. Open, unarchived, unlinked,
 * and never a `name (2)` collision copy.
 */
export function findTaggedSlugChannels(input: {
  projectChannelName: string;
  projectHomeChannelId: string | null;
  linkedChannelIds: ReadonlySet<string>;
  directory: readonly Omit<AdoptableChannel, "createdBy">[];
  /** channel id → tags of its kind:9007 create event. */
  createTags: ReadonlyMap<string, readonly (readonly string[])[]>;
}): string[] {
  const home = input.projectHomeChannelId?.trim().toLowerCase();
  const base = input.projectChannelName.trim().toLowerCase();
  if (!home || !base) return [];
  return input.directory
    .filter((channel) => {
      if (channel.archivedAt !== null) return false;
      if (input.linkedChannelIds.has(channel.id)) return false;
      if (/\s\(\d+\)$/.test(channel.name)) return false;
      const tags = input.createTags.get(channel.id) ?? [];
      const tagHome = tags.find((t) => t[0] === PROJECT_HOME_TAG)?.[1];
      const slug = tags.find((t) => t[0] === PROJECT_SLUG_TAG)?.[1];
      if (!tagHome || !slug || tagHome.trim().toLowerCase() !== home)
        return false;
      if (!/^[a-z0-9-]+$/.test(slug)) return false;
      // `<project>_<slug>` from the home channel, `<project>_<stack>_<slug>` from a stack channel.
      const name = channel.name.toLowerCase();
      return name.startsWith(`${base}_`) && name.endsWith(`_${slug}`);
    })
    .map((channel) => channel.id)
    .sort();
}
