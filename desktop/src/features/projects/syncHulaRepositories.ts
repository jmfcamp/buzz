import { ensureNamedChannel } from "@/features/projects/lib/hulaChannels";
import {
  allocateDisplayName,
  hulaDirectoryPath,
  repoChannelName,
} from "@/features/projects/lib/hulaProjectNames";
import { allocateRepositoryDtag } from "@/features/projects/lib/hulaProjectPlan";
import { listGitRepositories } from "@/features/projects/lib/hulaProjectResolve";
import { openClawWorkspaceClient } from "@/features/projects/lib/openClawWorkspaceClient";
import { projectDtagFromName } from "@/features/projects/projectCreation";
import type { ProjectEventTemplate } from "@/features/projects/projectCreation";
import type { Project } from "@/features/projects/projectModels";
import {
  MAX_HULA_PATH_BYTES,
  MAX_PROJECT_MEMBERS,
  MAX_PROJECT_RELATED_CHANNELS,
  PROJECT_HULA_PATH_TAG,
  PROJECT_RELATED_CHANNEL_TAG,
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
  validateProjectEventEnvelope(tags, patched.content);
  return { kind: patched.kind, content: patched.content, tags };
}

/**
 * Publish path records for git directories that appeared after create,
 * then patch the project once. Throws on failure. Returns how many were added.
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
  if (missing.length === 0) return 0;
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
          ["name", subPath],
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
    repositoryAddresses: [
      ...new Set([
        ...project.repositoryAddresses,
        ...added.map((repo) => repo.address),
      ]),
    ],
  });
  const projectEvent = await deps.signRelayEvent(patched);
  await deps.publishProjectEvent(projectEvent);
  return added.length;
}

function assertPathLength(hulaPath: string) {
  if (new TextEncoder().encode(hulaPath).byteLength > MAX_HULA_PATH_BYTES) {
    throw new Error("The Hula path is too long.");
  }
}
