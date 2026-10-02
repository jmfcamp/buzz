import { ensureNamedChannel } from "@/features/projects/lib/hulaChannels";
import { hulaDirectoryPath } from "@/features/projects/lib/hulaProjectNames";
import { planHulaChannels } from "@/features/projects/lib/hulaProjectPlan";
import { buildHulaProjectRecords } from "@/features/projects/lib/hulaProjectRecords";
import {
  conflictingListedProject,
  projectDtagFromName,
  type ProjectEventTemplate,
} from "@/features/projects/projectCreation";
import { buildProjectReadModels } from "@/features/projects/projectModels";
import type { Project } from "@/features/projects/projectModels";
import {
  fetchOwnHead,
  finishCreate,
  publishProjectEvent,
  publishRepositoryEvent,
  type CreateProjectInput,
  type CreateProjectResult,
  type CreateProjectResumeState,
} from "@/features/projects/createProject";
import { fetchProjects } from "@/features/projects/hooks";
import {
  createChannel,
  getOpenChannelDirectory,
  joinChannel,
  signRelayEvent,
} from "@/shared/api/tauri";
import type {
  Channel,
  ChannelVisibility,
  RelayEvent,
} from "@/shared/api/types";
import {
  KIND_PROJECT_ANNOUNCEMENT,
  KIND_REPO_ANNOUNCEMENT,
} from "@/shared/constants/kinds";
import { getCachedRelayOrigin } from "@/shared/lib/mediaUrl";
import { getIdentity } from "@/shared/api/tauriIdentity";

/** Relay and channel calls the Hula create path uses. Tests replace this. */
export type HulaCreateDeps = {
  getIdentity: () => Promise<{ pubkey: string }>;
  fetchProjects: () => Promise<Project[]>;
  getOpenChannelDirectory: () => Promise<Channel[]>;
  createChannel: typeof createChannel;
  joinChannel: (channelId: string) => Promise<void>;
  fetchOwnHead: typeof fetchOwnHead;
  signRelayEvent: (template: ProjectEventTemplate) => Promise<RelayEvent>;
  publishProjectEvent: (event: RelayEvent) => Promise<void>;
  publishRepositoryEvent: (event: RelayEvent) => Promise<void>;
  finishCreate: typeof finishCreate;
  relayOrigin: () => string | null;
};

const defaultHulaCreateDeps: HulaCreateDeps = {
  getIdentity,
  fetchProjects,
  getOpenChannelDirectory,
  createChannel,
  joinChannel,
  fetchOwnHead,
  signRelayEvent,
  publishProjectEvent,
  publishRepositoryEvent,
  finishCreate,
  relayOrigin: getCachedRelayOrigin,
};

/**
 * Create a Hula project: one channel per git directory, one path record per
 * directory, then one project event. Does not publish an empty relay repo.
 */
export async function createHulaProject(
  input: CreateProjectInput,
  resume: CreateProjectResumeState,
  deps: HulaCreateDeps = defaultHulaCreateDeps,
): Promise<CreateProjectResult> {
  const hula = input.hula;
  const root = hula ? hulaDirectoryPath(hula.hulaPath) : null;
  if (!hula || !root) {
    throw new Error("Choose a directory inside Hula.");
  }
  const repoPaths = hula.repoPaths.map((path) => {
    const normalized = hulaDirectoryPath(path);
    if (!normalized) {
      throw new Error("A repository path must stay inside the project.");
    }
    return normalized;
  });
  const name = input.name.trim();
  const dtag = projectDtagFromName(name);
  if (!dtag) {
    throw new Error("Project name must include letters or numbers.");
  }

  const identity = await deps.getIdentity();
  const owner = identity.pubkey.toLowerCase();
  const projectId = `${owner}:${dtag}`;
  const existingProjects = await deps.fetchProjects();
  const existing = existingProjects.find(
    (project) => project.owner.toLowerCase() === owner && project.dtag === dtag,
  );
  const canResume = resume.projectIds.has(projectId);
  if (existing && !existing.legacy && !canResume) {
    throw new Error(`You already have a project named "${dtag}".`);
  }
  if (existing && !existing.legacy && canResume) {
    return deps.finishCreate(
      resume.channels.get(projectId) ?? null,
      existing,
      input,
      resume,
      projectId,
    );
  }
  const conflict = conflictingListedProject(existingProjects, {
    dtag,
    name,
    ownerPubkey: owner,
  });
  if (conflict) {
    throw new Error(
      `A project named "${conflict.name}" already exists. Open that one instead of creating another.`,
    );
  }

  resume.projectIds.add(projectId);
  const directory = await deps.getOpenChannelDirectory();
  resume.hulaPlans ??= new Map();
  let plan = resume.hulaPlans.get(projectId);
  if (!plan) {
    const taken = directory
      .filter((channel) => channel.archivedAt === null)
      .map((channel) => channel.name);
    plan = planHulaChannels({
      projectName: name,
      rootPath: root,
      repoPaths,
      takenChannelNames: taken,
    });
    resume.hulaPlans.set(projectId, plan);
  }

  resume.hulaChannels ??= new Map();
  const visibility: ChannelVisibility = input.channelVisibility ?? "open";
  const channels = new Map<string, Channel>();
  for (const repo of plan.repos) {
    const channel = await ensureNamedChannel({
      channels: directory,
      createChannel: deps.createChannel,
      description: repo.subPath === "" ? input.description : undefined,
      joinChannel: deps.joinChannel,
      name: repo.channelName,
      resume: resume.hulaChannels,
      resumeKey: `${projectId}:${repo.channelName}`,
      visibility,
    });
    channels.set(repo.channelName, channel);
    if (repo.subPath === "") resume.channels.set(projectId, channel);
  }

  const home = channels.get(plan.homeChannelName);
  if (!home) throw new Error("The project channel is missing.");

  const records = buildHulaProjectRecords({
    description: input.description,
    homeChannelId: home.id,
    name,
    ownerPubkey: owner,
    projectVisibility: input.projectVisibility ?? "listed",
    repos: plan.repos.map((repo) => ({
      ...repo,
      channelId: channels.get(repo.channelName)?.id ?? "",
    })),
  });

  const projectDtag =
    records.project.tags.find((tag) => tag[0] === "d")?.[1] ?? dtag;
  const existingHead = await deps.fetchOwnHead(
    KIND_PROJECT_ANNOUNCEMENT,
    owner,
    projectDtag,
  );
  const existingPath = existingHead?.tags.find(
    (tag) => tag[0] === "buzz-hula-path",
  )?.[1];
  if (existingHead && existingPath !== root) {
    throw new Error(`You already have a project named "${dtag}".`);
  }

  const repositoryEvents: RelayEvent[] = [];
  for (const repo of records.repositories) {
    let event = await deps.fetchOwnHead(
      KIND_REPO_ANNOUNCEMENT,
      owner,
      repo.dtag,
    );
    if (!event) {
      event = await deps.signRelayEvent(repo.event);
      await deps.publishRepositoryEvent(event);
    }
    repositoryEvents.push(event);
  }

  if (existingHead) {
    const read = readHulaProject(existingHead, repositoryEvents, deps);
    if (!read) {
      throw new Error("The project was created but could not be read.");
    }
    return deps.finishCreate(home, read, input, resume, projectId);
  }

  const projectEvent = await deps.signRelayEvent(records.project);
  await deps.publishProjectEvent(projectEvent);
  const project = readHulaProject(projectEvent, repositoryEvents, deps);
  if (!project) {
    throw new Error("The project was created but could not be read.");
  }
  return deps.finishCreate(home, project, input, resume, projectId);
}

function readHulaProject(
  projectEvent: RelayEvent,
  repositoryEvents: readonly RelayEvent[],
  deps: HulaCreateDeps,
): Project | undefined {
  const [project] = buildProjectReadModels({
    projectEvents: [projectEvent],
    repositoryEvents: [...repositoryEvents],
    relayOrigin: deps.relayOrigin(),
  });
  return project;
}
