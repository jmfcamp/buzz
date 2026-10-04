import { ensureNamedChannel } from "@/features/projects/lib/hulaChannels";
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
};

const defaultHulaSyncDeps: HulaSyncDeps = {
  listGitRepositories: (root) =>
    listGitRepositories(root, openClawWorkspaceClient),
  getOpenChannelDirectory,
  createChannel,
  joinChannel,
  fetchOwnHead,
  signRelayEvent,
  publishProjectEvent,
  publishRepositoryEvent,
  getIdentity,
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
  const tags = patched.tags.map((tag) => [...tag]);
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
): Promise<number> {
  if (!project.hulaPath || project.legacy) return 0;
  const root = hulaDirectoryPath(project.hulaPath);
  if (!root) throw new Error("Choose a directory inside Hula.");

  const discovered = await deps.listGitRepositories(root);
  const known = new Set<string>([root]);
  for (const repository of project.repositories) {
    if (!repository.hulaPath) continue;
    const normalized = hulaDirectoryPath(repository.hulaPath);
    if (normalized) known.add(normalized);
  }
  const missing = discovered.filter((path) => !known.has(path));
  if (
    project.repositoryAddresses.length + missing.length >
    MAX_PROJECT_MEMBERS
  ) {
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
  if (missing.length === 0) {
    if (!driPubkey) return renamed;
    const wrote = await publishMissingProjectDri(project, driPubkey, deps);
    return renamed + (wrote ? 1 : 0);
  }

  const directory = await deps.getOpenChannelDirectory();
  const taken = directory
    .filter((channel) => channel.archivedAt === null)
    .map((channel) => channel.name);
  const usedDtags = project.repositories.map((repository) => repository.dtag);
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
      ...project.relatedChannelIds,
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
    repositoryAddresses: [
      ...new Set([
        ...project.repositoryAddresses,
        ...added.map((repo) => repo.address),
      ]),
    ],
  });
  const projectEvent = await deps.signRelayEvent(patched);
  await deps.publishProjectEvent(projectEvent);
  return added.length + renamed;
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
