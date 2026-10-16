import { ensureNamedChannel } from "@/features/projects/lib/hulaChannels";
import {
  findAdoptableProjectChannels,
  findTaggedSlugChannels,
} from "@/features/projects/lib/adoptAgentChannels";
import { relayClient } from "@/shared/api/relayClient";
import { getChannelDetails } from "@/shared/api/tauriChannels";
import { getUsersBatch } from "@/shared/api/tauriProfiles";
import {
  allocateDisplayName,
  hulaDirectoryPath,
  repoChannelName,
  repositoryNameFromHulaPath,
} from "@/features/projects/lib/hulaProjectNames";
import { allocateRepositoryDtag } from "@/features/projects/lib/hulaProjectPlan";
import { listGitRepositories } from "@/features/projects/lib/hulaProjectResolve";
import { openClawWorkspaceClient } from "@/features/projects/lib/openClawWorkspaceClient";
import { ensureProjectCodingAgentMember } from "@/features/projects/lib/projectCodingAgentMembership";
import { replaceProjectCodingAgentTag } from "@/features/projects/lib/projectCodingAgent";
import {
  isValidProjectDri,
  replaceProjectDriTag,
  requireProjectDri,
  withProjectDriTag,
} from "@/features/projects/lib/projectDri";
import { projectDtagFromName } from "@/features/projects/projectCreation";
import type { ProjectEventTemplate } from "@/features/projects/projectCreation";
import type { Project } from "@/features/projects/projectModels";
import {
  MAX_HULA_PATH_BYTES,
  MAX_PROJECT_MEMBERS,
  MAX_PROJECT_RELATED_CHANNELS,
  PROJECT_HULA_PATH_TAG,
  PROJECT_RELATED_CHANNEL_TAG,
  readProjectCodingAgent,
  readProjectDri,
  validateProjectEventEnvelope,
} from "@/features/projects/projectModels";
import { buildProjectPatchTemplate } from "@/features/projects/projectRepositoryCreation";
import {
  fetchOwnHead,
  publishProjectEvent,
  publishRepositoryEvent,
} from "@/features/projects/createProject";
import {
  createChannel,
  getOpenChannelDirectory,
  joinChannel,
  signRelayEvent,
} from "@/shared/api/tauri";
import { getIdentity } from "@/shared/api/tauriIdentity";
import { planRepositoryLinks } from "@/features/projects/lib/hulaRepositoryLinks";
import { fetchProjectEventsExhaustively } from "@/features/projects/projectEnumeration";
import type { Channel, RelayEvent } from "@/shared/api/types";
import {
  KIND_PROJECT_ANNOUNCEMENT,
  KIND_REPO_ANNOUNCEMENT,
} from "@/shared/constants/kinds";

type HulaSyncDeps = {
  listGitRepositories: (root: string) => Promise<string[]>;
  getOpenChannelDirectory: () => Promise<Channel[]>;
  createChannel: typeof createChannel;
  joinChannel: (channelId: string) => Promise<void>;
  fetchOwnHead: typeof fetchOwnHead;
  signRelayEvent: (template: ProjectEventTemplate) => Promise<RelayEvent>;
  publishProjectEvent: (event: RelayEvent) => Promise<void>;
  publishRepositoryEvent: (event: RelayEvent) => Promise<void>;
  /** Logged-in desktop user. Used to backfill a missing DRI. Tests omit it. */
  getIdentity?: () => Promise<{ pubkey: string }>;
  /**
   * Every live repository announcement, any author. Lets the owner's sync
   * reuse a collaborator's repo for a folder instead of re-creating it.
   */
  listRepositoryAnnouncements?: () => Promise<RelayEvent[]>;
  /** Profile lookup (agent → owner) used to adopt the owner's agents' channels. */
  getChannelDetails: (channelId: string) => Promise<{ createdBy: string }>;
  getUsersBatch?: (
    pubkeys: string[],
  ) => Promise<{ profiles: Record<string, { ownerPubkey: string | null }> }>;
  /** kind:9007 channel-create events for these channel ids (slug-channel project tags). */
  fetchChannelCreates?: (channelIds: string[]) => Promise<RelayEvent[]>;
};

const defaultHulaSyncDeps: HulaSyncDeps = {
  listGitRepositories: (root) =>
    listGitRepositories(root, openClawWorkspaceClient),
  getOpenChannelDirectory,
  getChannelDetails,
  getUsersBatch,
  fetchChannelCreates: (channelIds) =>
    relayClient.fetchEvents({
      kinds: [9007],
      "#h": channelIds,
      limit: channelIds.length * 2,
    }),
  createChannel,
  joinChannel,
  fetchOwnHead,
  signRelayEvent,
  publishProjectEvent,
  publishRepositoryEvent,
  getIdentity,
  listRepositoryAnnouncements: () =>
    fetchProjectEventsExhaustively([KIND_REPO_ANNOUNCEMENT]),
};

/**
 * Replace membership and add any missing related channels on one project head.
 * Fails before a caller can treat the project as updated.
 */
export function buildHulaMembershipPatch(input: {
  liveHead: RelayEvent;
  ownerPubkey: string;
  relatedChannelIds: readonly string[];
  repositoryAddresses: string[];
  /** Logged-in owner pubkey used when the live announcement has no DRI. */
  driPubkey?: string | null;
  /** Related channels to remove (for example archived duplicate channels). */
  dropRelatedChannelIds?: readonly string[];
}): ProjectEventTemplate {
  const patched = buildProjectPatchTemplate({
    liveHead: input.liveHead,
    ownerPubkey: input.ownerPubkey,
    repositoryAddresses: input.repositoryAddresses,
  });
  const present = new Set(
    patched.tags
      .filter((tag) => tag[0] === PROJECT_RELATED_CHANNEL_TAG)
      .map((tag) => tag[1]),
  );
  const drop = new Set(input.dropRelatedChannelIds ?? []);
  const tags = patched.tags
    .filter(
      (tag) => !(tag[0] === PROJECT_RELATED_CHANNEL_TAG && drop.has(tag[1])),
    )
    .map((tag) => [...tag]);
  for (const channelId of [...drop]) present.delete(channelId);
  for (const channelId of [...input.relatedChannelIds].sort()) {
    if (!channelId || present.has(channelId)) continue;
    tags.push([PROJECT_RELATED_CHANNEL_TAG, channelId]);
    present.add(channelId);
  }
  if (
    tags.filter((tag) => tag[0] === PROJECT_RELATED_CHANNEL_TAG).length >
    MAX_PROJECT_RELATED_CHANNELS
  ) {
    throw new Error(
      `A project can link at most ${MAX_PROJECT_RELATED_CHANNELS} channels.`,
    );
  }
  const withDri = input.driPubkey
    ? withProjectDriTag(tags, input.driPubkey)
    : tags;
  validateProjectEventEnvelope(withDri, patched.content);
  return { kind: patched.kind, content: patched.content, tags: withDri };
}

/**
 * Republish the project announcement with the logged-in user as DRI when the
 * stored tag is missing and that user owns the project. Does nothing when a
 * valid DRI is already on the live head. Returns true only when a replacement
 * event was published.
 */
export async function publishMissingProjectDri(
  project: Pick<Project, "dtag" | "dri" | "owner">,
  identityPubkey: string,
  deps: Pick<
    HulaSyncDeps,
    "fetchOwnHead" | "publishProjectEvent" | "signRelayEvent"
  > = defaultHulaSyncDeps,
): Promise<boolean> {
  const owner = project.owner.trim().toLowerCase();
  const identity = identityPubkey.trim().toLowerCase();
  if (!isValidProjectDri(identity) || identity !== owner) return false;
  if (isValidProjectDri(project.dri)) return false;
  const liveHead = await deps.fetchOwnHead(
    KIND_PROJECT_ANNOUNCEMENT,
    owner,
    project.dtag,
  );
  if (!liveHead || readProjectDri(liveHead.tags)) return false;
  const repositoryAddresses = liveHead.tags
    .filter((tag) => tag[0] === "a" && tag[1])
    .map((tag) => tag[1]);
  const patched = buildProjectPatchTemplate({
    liveHead,
    ownerPubkey: owner,
    repositoryAddresses,
  });
  const tags = withProjectDriTag(patched.tags, identity);
  validateProjectEventEnvelope(tags, patched.content);
  const event = await deps.signRelayEvent({
    kind: patched.kind,
    content: patched.content,
    tags,
  });
  await deps.publishProjectEvent(event);
  return true;
}

/**
 * Set or change the DRI on the live project announcement.
 * The chosen pubkey is whatever the picker saved, not the logged-in user.
 * Only the project owner can sign the replacement.
 */
export async function publishProjectDri(
  project: Pick<Project, "dtag" | "owner">,
  driPubkey: string,
  deps: Pick<
    HulaSyncDeps,
    "fetchOwnHead" | "getIdentity" | "publishProjectEvent" | "signRelayEvent"
  > = defaultHulaSyncDeps,
): Promise<string> {
  const dri = requireProjectDri(driPubkey);
  const identity =
    (await deps.getIdentity?.())?.pubkey.trim().toLowerCase() ?? "";
  const owner = project.owner.trim().toLowerCase();
  if (!isValidProjectDri(identity) || identity !== owner) {
    throw new Error("Only the project owner can set the DRI.");
  }
  const liveHead = await deps.fetchOwnHead(
    KIND_PROJECT_ANNOUNCEMENT,
    owner,
    project.dtag,
  );
  if (!liveHead) {
    throw new Error(
      "Could not find this project on the relay. Refresh and try again.",
    );
  }
  if (readProjectDri(liveHead.tags) === dri) return dri;
  const repositoryAddresses = liveHead.tags
    .filter((tag) => tag[0] === "a" && tag[1])
    .map((tag) => tag[1]);
  const patched = buildProjectPatchTemplate({
    liveHead,
    ownerPubkey: owner,
    repositoryAddresses,
  });
  const tags = replaceProjectDriTag(patched.tags, dri);
  validateProjectEventEnvelope(tags, patched.content);
  const event = await deps.signRelayEvent({
    kind: patched.kind,
    content: patched.content,
    tags,
  });
  await deps.publishProjectEvent(event);
  return dri;
}

type PublishCodingAgentDeps = Pick<
  HulaSyncDeps,
  "fetchOwnHead" | "getIdentity" | "publishProjectEvent" | "signRelayEvent"
> & {
  /**
   * Adds the bot to the project channel. Must not publish a project event,
   * so a membership write cannot drop the DRI tag.
   */
  ensureChannelMember: (channelId: string, pubkey: string) => Promise<string>;
};

const defaultPublishCodingAgentDeps: PublishCodingAgentDeps = {
  fetchOwnHead,
  getIdentity,
  publishProjectEvent,
  signRelayEvent,
  ensureChannelMember: ensureProjectCodingAgentMember,
};

/**
 * Set or change the coding agent on the live project announcement.
 * Channel membership is updated first and does not rewrite the announcement.
 * The replacement event changes only the `coding-agent` tag, so `dri` stays.
 * Only the project owner can sign the replacement.
 */
export async function publishProjectCodingAgent(
  project: Pick<Project, "dtag" | "owner" | "projectChannelId">,
  codingAgentPubkey: string,
  deps: PublishCodingAgentDeps = defaultPublishCodingAgentDeps,
): Promise<string> {
  const identity =
    (await deps.getIdentity?.())?.pubkey.trim().toLowerCase() ?? "";
  const owner = project.owner.trim().toLowerCase();
  if (!isValidProjectDri(identity) || identity !== owner) {
    throw new Error("Only the project owner can set the coding agent.");
  }
  const channelId = project.projectChannelId?.trim() ?? "";
  if (!channelId) {
    throw new Error("This project has no channel for a coding agent.");
  }
  const codingAgent = await deps.ensureChannelMember(
    channelId,
    codingAgentPubkey,
  );
  const liveHead = await deps.fetchOwnHead(
    KIND_PROJECT_ANNOUNCEMENT,
    owner,
    project.dtag,
  );
  if (!liveHead) {
    throw new Error(
      "Could not find this project on the relay. Refresh and try again.",
    );
  }
  if (readProjectCodingAgent(liveHead.tags) === codingAgent) return codingAgent;
  const repositoryAddresses = liveHead.tags
    .filter((tag) => tag[0] === "a" && tag[1])
    .map((tag) => tag[1]);
  const patched = buildProjectPatchTemplate({
    liveHead,
    ownerPubkey: owner,
    repositoryAddresses,
  });
  const tags = replaceProjectCodingAgentTag(patched.tags, codingAgent);
  validateProjectEventEnvelope(tags, patched.content);
  const event = await deps.signRelayEvent({
    kind: patched.kind,
    content: patched.content,
    tags,
  });
  await deps.publishProjectEvent(event);
  return codingAgent;
}

async function loggedInOwnerDri(
  project: Pick<Project, "dri" | "owner">,
  deps: HulaSyncDeps,
): Promise<string | null> {
  if (isValidProjectDri(project.dri) || !deps.getIdentity) return null;
  const identity = (await deps.getIdentity()).pubkey.trim().toLowerCase();
  if (
    !isValidProjectDri(identity) ||
    identity !== project.owner.trim().toLowerCase()
  ) {
    return null;
  }
  return identity;
}

/**
 * Publish path records for git directories that appeared after create,
 * then patch the project once. Also replaces a repository announcement whose
 * displayed name is not its OpenClaw directory. The project name and the
 * repository `d` tag stay put. Throws on failure. Returns how many repository
 * announcements were published.
 */
export async function syncMissingHulaRepositories(
  project: Project,
  deps: HulaSyncDeps = defaultHulaSyncDeps,
  options: {
    /**
     * Only fix the project's repository links from live announcements under the
     * project folder. Never lists the workspace and never creates repos or channels.
     */
    linksOnly?: boolean;
  } = {},
): Promise<number> {
  if (!project.hulaPath || project.legacy) return 0;
  // Only the project owner may add repositories or republish the project.
  // Any other viewer would sign the owner's announcement with their own key,
  // which forks the project into a second row and re-creates repos each visit.
  if (deps.getIdentity) {
    const identity =
      (await deps.getIdentity())?.pubkey.trim().toLowerCase() ?? "";
    if (!identity || identity !== project.owner.trim().toLowerCase()) return 0;
  }
  const root = hulaDirectoryPath(project.hulaPath);
  if (!root) throw new Error("Choose a directory inside Hula.");

  const announcements = deps.listRepositoryAnnouncements
    ? await deps.listRepositoryAnnouncements()
    : null;
  if (options.linksOnly && !announcements) return 0;
  const discovered = options.linksOnly
    ? announcementPathsUnder(root, announcements ?? [])
    : await deps.listGitRepositories(root);
  if (
    announcements &&
    announcements.length === 0 &&
    project.repositories.length > 0
  ) {
    // A project with live repos can't have zero announcements; the read failed.
    // Creating now would duplicate every repo, so stop and let the caller retry.
    throw new Error("Could not load repositories from the relay. Try again.");
  }
  const links = planRepositoryLinks(project, root, discovered, announcements);
  const known = links.known;
  const missing = options.linksOnly
    ? []
    : discovered.filter((path) => !known.has(path));
  const linkChanged =
    links.relinked.length > 0 ||
    links.replaced.size > 0 ||
    links.dropped.size > 0;
  if (links.addresses.length + missing.length > MAX_PROJECT_MEMBERS) {
    throw new Error(
      `A project can include at most ${MAX_PROJECT_MEMBERS} repositories.`,
    );
  }
  if (
    project.relatedChannelIds.length + missing.length >
    MAX_PROJECT_RELATED_CHANNELS
  ) {
    throw new Error(
      `A project can link at most ${MAX_PROJECT_RELATED_CHANNELS} channels.`,
    );
  }

  const renamed = await correctStoredRepositoryNames(project, deps);
  const driPubkey = await loggedInOwnerDri(project, deps);
  const adopted = await adoptableAgentChannels(project, deps, {
    trustNamePrefix: options.linksOnly === true,
  });
  if (missing.length === 0 && !linkChanged && adopted.length === 0) {
    if (!driPubkey) return renamed;
    const wrote = await publishMissingProjectDri(project, driPubkey, deps);
    return renamed + (wrote ? 1 : 0);
  }

  const directory = await deps.getOpenChannelDirectory();
  const taken = directory
    .filter((channel) => channel.archivedAt === null)
    .map((channel) => channel.name);
  const usedDtags = [
    ...project.repositories.map((repository) => repository.dtag),
    ...links.allDtags,
  ];
  const archived = new Set(
    directory
      .filter((channel) => channel.archivedAt !== null)
      .map((channel) => channel.id),
  );
  const dropRelated = project.relatedChannelIds.filter((id) =>
    archived.has(id),
  );
  const resume = new Map<string, Channel>();
  const added: { address: string; channelId: string; dtag: string }[] = [];

  for (const path of missing) {
    const subPath = path.slice(root.length + 1);
    const bare = repoChannelName(project.name, subPath);
    if (!bare) {
      throw new Error(`The channel name for ${subPath} is too long to store.`);
    }
    const channelName = allocateDisplayName(bare, taken);
    if (!channelName) {
      throw new Error(`The channel name for ${subPath} is too long to store.`);
    }
    taken.push(channelName);
    assertPathLength(path);
    const dtag = allocateRepositoryDtag(
      projectDtagFromName(channelName) || "repo",
      usedDtags,
    );
    usedDtags.push(dtag);
    const channel = await ensureNamedChannel({
      channels: directory,
      createChannel: deps.createChannel,
      joinChannel: deps.joinChannel,
      name: channelName,
      resume,
      resumeKey: `${project.owner}:${project.dtag}:${channelName}`,
      visibility: "open",
    });
    let event = await deps.fetchOwnHead(
      KIND_REPO_ANNOUNCEMENT,
      project.owner.toLowerCase(),
      dtag,
    );
    if (!event) {
      event = await deps.signRelayEvent({
        kind: KIND_REPO_ANNOUNCEMENT,
        content: "",
        tags: [
          ["d", dtag],
          ["name", repositoryNameFromHulaPath(path) ?? subPath],
          ["buzz-channel", channel.id],
          [PROJECT_HULA_PATH_TAG, path],
        ],
      });
      await deps.publishRepositoryEvent(event);
    }
    added.push({
      address: `${KIND_REPO_ANNOUNCEMENT}:${project.owner.toLowerCase()}:${dtag}`,
      channelId: channel.id,
      dtag,
    });
  }

  const liveHead = await deps.fetchOwnHead(
    KIND_PROJECT_ANNOUNCEMENT,
    project.owner.toLowerCase(),
    project.dtag,
  );
  if (!liveHead) {
    throw new Error(
      "Could not find this project on the relay. Refresh and try again.",
    );
  }
  const related = [
    ...new Set([
      ...project.relatedChannelIds.filter((id) => !archived.has(id)),
      ...links.relinkedChannelIds.filter((id) => !archived.has(id)),
      ...adopted,
      ...added
        .map((repo) => repo.channelId)
        .filter((channelId) => channelId !== project.projectChannelId),
    ]),
  ];
  const patched = buildHulaMembershipPatch({
    liveHead,
    ownerPubkey: project.owner,
    relatedChannelIds: related,
    driPubkey,
    dropRelatedChannelIds: dropRelated,
    repositoryAddresses: [
      ...new Set([...links.addresses, ...added.map((repo) => repo.address)]),
    ],
  });
  const projectEvent = await deps.signRelayEvent(patched);
  await deps.publishProjectEvent(projectEvent);
  return added.length + renamed + adopted.length + (linkChanged ? 1 : 0);
}

/** Owner-agent channels named under this project that it does not link yet. */
async function adoptableAgentChannels(
  project: Project,
  deps: HulaSyncDeps,
  options: { trustNamePrefix: boolean },
): Promise<string[]> {
  try {
    const directory = await deps.getOpenChannelDirectory();
    const linked = new Set<string>([
      ...(project.projectChannelId ? [project.projectChannelId] : []),
      ...project.relatedChannelIds,
      ...project.repositories.flatMap((repository) =>
        repository.channelId ? [repository.channelId] : [],
      ),
    ]);
    const prefix = `${project.name.trim().toLowerCase()}_`;
    const candidates = directory
      .filter(
        (channel) =>
          channel.archivedAt === null &&
          !linked.has(channel.id) &&
          channel.name.toLowerCase().startsWith(prefix),
      )
      .slice(0, 20);
    if (candidates.length === 0) return [];
    // Slug channels tagged for this project at creation (`buzz channels create --project-home --slug`).
    const tagged = await taggedSlugChannels(project, candidates, linked, deps);
    if (options.trustNamePrefix) {
      return findAdoptableProjectChannels({
        projectChannelName: project.name,
        ownerPubkey: project.owner,
        linkedChannelIds: linked,
        directory: candidates.map((channel) => ({ ...channel, createdBy: "" })),
        creatorOwners: new Map(),
        trustNamePrefix: true,
      });
    }
    if (!deps.getUsersBatch) return tagged;
    const withCreators = (
      await Promise.all(
        candidates.map(async (channel) => {
          try {
            const detail = await deps.getChannelDetails(channel.id);
            return { ...channel, createdBy: detail.createdBy };
          } catch {
            return null;
          }
        }),
      )
    ).filter((channel) => channel !== null);
    const creators = [
      ...new Set(
        withCreators.map((channel) => channel.createdBy.trim().toLowerCase()),
      ),
    ];
    if (creators.length === 0) return tagged;
    const { profiles } = await deps.getUsersBatch(creators);
    const creatorOwners = new Map(
      creators.map((pubkey) => [pubkey, profiles[pubkey]?.ownerPubkey ?? null]),
    );
    return [
      ...new Set([
        ...tagged,
        ...findAdoptableProjectChannels({
          projectChannelName: project.name,
          ownerPubkey: project.owner,
          linkedChannelIds: linked,
          directory: withCreators,
          creatorOwners,
        }),
      ]),
    ].sort();
  } catch {
    // Adoption is best-effort; never block the repository sync on it.
    return [];
  }
}

async function taggedSlugChannels(
  project: Project,
  candidates: { id: string; name: string; archivedAt: string | null }[],
  linked: ReadonlySet<string>,
  deps: HulaSyncDeps,
): Promise<string[]> {
  if (!deps.fetchChannelCreates || !project.projectChannelId) return [];
  try {
    const events = await deps.fetchChannelCreates(candidates.map((c) => c.id));
    const createTags = new Map<string, string[][]>();
    for (const event of events) {
      const id = event.tags.find((t) => t[0] === "h")?.[1];
      if (id && !createTags.has(id)) createTags.set(id, event.tags);
    }
    return findTaggedSlugChannels({
      projectChannelName: project.name,
      projectHomeChannelId: project.projectChannelId,
      linkedChannelIds: linked,
      directory: candidates,
      createTags,
    });
  } catch {
    return [];
  }
}

/**
 * Replace the `name` tag when it is not the workspace directory.
 * Other tags, including `d`, are copied from the live announcement.
 */
async function correctStoredRepositoryNames(
  project: Project,
  deps: HulaSyncDeps,
): Promise<number> {
  let corrected = 0;
  for (const repository of project.repositories) {
    if (!repository.hulaPath || !repository.dtag) continue;
    const expected = repositoryNameFromHulaPath(repository.hulaPath);
    if (!expected || expected === repository.name) continue;
    const head = await deps.fetchOwnHead(
      KIND_REPO_ANNOUNCEMENT,
      project.owner.toLowerCase(),
      repository.dtag,
    );
    if (!head) continue;
    const current = head.tags.find((tag) => tag[0] === "name")?.[1];
    if (current === expected) continue;
    const event = await deps.signRelayEvent(
      repositoryAnnouncementWithDirectoryName(head, expected),
    );
    await deps.publishRepositoryEvent(event);
    corrected += 1;
  }
  return corrected;
}

function repositoryAnnouncementWithDirectoryName(
  head: RelayEvent,
  name: string,
): ProjectEventTemplate {
  let wroteName = false;
  const tags: string[][] = [];
  for (const tag of head.tags) {
    if (tag[0] === "name") {
      if (wroteName) continue;
      tags.push(["name", name]);
      wroteName = true;
      continue;
    }
    tags.push([...tag]);
  }
  if (!wroteName) tags.push(["name", name]);
  return {
    kind: KIND_REPO_ANNOUNCEMENT,
    content: head.content,
    tags,
  };
}

function assertPathLength(hulaPath: string) {
  if (new TextEncoder().encode(hulaPath).byteLength > MAX_HULA_PATH_BYTES) {
    throw new Error("The Hula path is too long.");
  }
}

/** Folder paths of live repo announcements inside `root` (and `root` itself). */
function announcementPathsUnder(
  root: string,
  events: readonly RelayEvent[],
): string[] {
  const paths = new Set<string>([root]);
  for (const event of events) {
    if (event.kind !== KIND_REPO_ANNOUNCEMENT) continue;
    const raw = event.tags.find((tag) => tag[0] === PROJECT_HULA_PATH_TAG)?.[1];
    const path = raw ? hulaDirectoryPath(raw) : null;
    if (path && path.startsWith(`${root}/`)) paths.add(path);
  }
  return [...paths];
}
