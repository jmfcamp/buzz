import { collectProjectRelatedChannelRows } from "@/features/projects/lib/projectRelatedChannels";
import {
  projectsIndexChannelMemberPubkeys,
  type ProjectsIndexChannel,
} from "@/features/projects/lib/projectsIndexTree";
import { normalizePubkey } from "@/shared/lib/pubkey";

/** Projects and channels the index already has. Structural so the filter stays data-only. */
export type ProjectsIndexActivityProject = {
  id: string;
  name: string;
  primaryRepositoryAddress: string | null;
  projectChannelId: string | null;
  relatedChannelIds?: readonly string[];
  repositories: Array<{
    channelId?: string | null;
    id: string;
    name: string;
    repoAddress: string;
  }>;
};

export type ProjectsIndexActivityFilter =
  | { type: "all" }
  | { type: "project"; projectId: string }
  | { type: "channel"; channelId: string };

export type ProjectsIndexActivityScopeEntry = {
  /** Created-project and snapshot commit rows. Those belong to the primary repo. */
  includeProjectEvents: boolean;
  projectId: string;
  /** Null means every repository on the project. */
  repositoryIds: ReadonlySet<string> | null;
};

export type ProjectsIndexActivityScope = {
  entries: ProjectsIndexActivityScopeEntry[];
};

function primaryRepositoryId(project: ProjectsIndexActivityProject) {
  return (
    project.repositories.find(
      (repository) =>
        repository.repoAddress === project.primaryRepositoryAddress,
    )?.id ??
    project.repositories[0]?.id ??
    null
  );
}

/**
 * Null means the whole feed. A project entry keeps that project's events.
 * A channel entry follows the binding already stored on the project: a
 * project-wide channel keeps every event, a repository channel keeps that
 * repository's tasks and reviews, plus the snapshot commit only when the
 * binding is the primary repository the snapshot describes.
 */
export function projectsIndexActivityScope(
  filter: ProjectsIndexActivityFilter,
  projects: readonly ProjectsIndexActivityProject[],
): ProjectsIndexActivityScope | null {
  if (filter.type === "all") return null;
  if (filter.type === "project") {
    return {
      entries: [
        {
          includeProjectEvents: true,
          projectId: filter.projectId,
          repositoryIds: null,
        },
      ],
    };
  }

  const rows = collectProjectRelatedChannelRows(projects).filter(
    (row) => row.channelId === filter.channelId,
  );
  const byProject = new Map<
    string,
    { includeProjectEvents: boolean; repositoryIds: Set<string> | null }
  >();
  for (const row of rows) {
    const project = projects.find((item) => item.id === row.projectId);
    const primaryId = project ? primaryRepositoryId(project) : null;
    const current = byProject.get(row.projectId) ?? {
      includeProjectEvents: false,
      repositoryIds: new Set<string>(),
    };
    if (row.repositoryId == null) {
      current.includeProjectEvents = true;
      current.repositoryIds = null;
    } else if (current.repositoryIds) {
      current.repositoryIds.add(row.repositoryId);
      if (row.repositoryId === primaryId) current.includeProjectEvents = true;
    }
    byProject.set(row.projectId, current);
  }

  return {
    entries: [...byProject.entries()].map(([projectId, entry]) => ({
      includeProjectEvents: entry.includeProjectEvents,
      projectId,
      repositoryIds: entry.repositoryIds,
    })),
  };
}

export function activityWorkItemInScope(
  scope: ProjectsIndexActivityScope | null,
  projectId: string,
  repositoryId: string,
) {
  if (!scope) return true;
  const entry = scope.entries.find((item) => item.projectId === projectId);
  if (!entry) return false;
  return entry.repositoryIds === null || entry.repositoryIds.has(repositoryId);
}

/**
 * Null when the activity filter is All, so the who menu may use rosters that
 * were already loaded. A project filter returns members of that project's
 * related channels. A channel filter returns members of the related channels
 * on the project that channel belongs to, plus the selected channel. Channels
 * whose member list was not loaded contribute nothing. This is not the relay.
 */
export function activityScopeChannelMemberPubkeys(
  filter: ProjectsIndexActivityFilter,
  projects: readonly ProjectsIndexActivityProject[],
  channelsById: ReadonlyMap<string, ProjectsIndexChannel>,
): Set<string> | null {
  if (filter.type === "all") return null;

  const projectIds = new Set<string>();
  if (filter.type === "project") {
    projectIds.add(filter.projectId);
  } else {
    const scope = projectsIndexActivityScope(filter, projects);
    for (const entry of scope?.entries ?? []) projectIds.add(entry.projectId);
  }

  const channelIds = new Set<string>();
  if (filter.type === "channel") channelIds.add(filter.channelId);
  for (const row of collectProjectRelatedChannelRows(projects)) {
    if (!projectIds.has(row.projectId)) continue;
    channelIds.add(row.channelId);
  }

  const pubkeys = new Set<string>();
  for (const channelId of channelIds) {
    const members = projectsIndexChannelMemberPubkeys(
      channelsById.get(channelId),
    );
    if (!members) continue;
    for (const member of members) {
      const pubkey = normalizePubkey(member);
      if (!/^[0-9a-f]{64}$/.test(pubkey)) continue;
      pubkeys.add(pubkey);
    }
  }
  return pubkeys;
}
