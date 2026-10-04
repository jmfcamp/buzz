import type {
  Project,
  ProjectIssueListItem,
  Repository,
} from "@/features/projects/hooks";
import {
  collapseProjectRelatedChannelRows,
  collectProjectRelatedChannelRows,
  type ProjectRelatedChannelDisplayRow,
} from "@/features/projects/lib/projectRelatedChannels";
import {
  nestRepositoryListRows,
  type NestedRepositoryRow,
} from "@/features/projects/lib/repositoryListRoles";
import { matchesProjectsSearch } from "@/features/projects/lib/projectsSearch";
import type { ProjectsSort } from "@/features/projects/lib/projectsViewHelpers";
import {
  TASK_STATUS_WORDS,
  taskStatusWord,
  type TaskStatusWord,
} from "@/features/projects/lib/taskStatus";

export type ProjectsIndexChannel = {
  channelType?: "stream" | "forum" | "dm";
  description?: string | null;
  id: string;
  lastMessageAt?: string | null;
  /** Membership already on the channel list. Absent when members were not loaded. */
  memberPubkeys?: readonly string[] | null;
  name?: string | null;
  participantPubkeys?: readonly string[] | null;
  participants?: readonly string[] | null;
};

export type ProjectsIndexRepositoryRow = {
  project: Project;
  repository: Repository;
};

export type ProjectsIndexTreeNode = {
  channels: ProjectRelatedChannelDisplayRow[];
  issues: ProjectIssueListItem[];
  project: Project;
  repositories: NestedRepositoryRow<ProjectsIndexRepositoryRow>[];
};

const HEX_PUBKEY = /^[0-9a-fA-F]{64}$/;

function pubkeyOrNull(value: unknown): string | null {
  return typeof value === "string" && HEX_PUBKEY.test(value) ? value : null;
}

/**
 * Member pubkeys already carried by the channel list. Prefers `memberPubkeys`
 * when that list has people, otherwise the participant list the old channels
 * index used. Null when neither list was loaded.
 */
export function projectsIndexChannelMemberPubkeys(
  channel: ProjectsIndexChannel | undefined,
): readonly string[] | null {
  if (!channel) return null;
  if (channel.memberPubkeys && channel.memberPubkeys.length > 0) {
    return channel.memberPubkeys;
  }
  const participants = channel.participantPubkeys ?? channel.participants;
  if (participants) return participants;
  if (channel.memberPubkeys) return channel.memberPubkeys;
  return null;
}

/**
 * DRI pubkey when the project stores one. The field may be `dri` or
 * `driPubkey`, or a `dri` / `buzz-dri` tag. Nothing is shown when it is absent.
 */
export function projectDriPubkey(project: {
  dri?: unknown;
  driPubkey?: unknown;
  eventTags?: unknown;
  tags?: unknown;
}): string | null {
  const direct = pubkeyOrNull(project.dri) ?? pubkeyOrNull(project.driPubkey);
  if (direct) return direct;
  const tags = Array.isArray(project.eventTags)
    ? project.eventTags
    : Array.isArray(project.tags)
      ? project.tags
      : null;
  if (!tags) return null;
  for (const tag of tags) {
    if (!Array.isArray(tag) || (tag[0] !== "dri" && tag[0] !== "buzz-dri")) {
      continue;
    }
    const pubkey = pubkeyOrNull(tag[1]);
    if (pubkey) return pubkey;
  }
  return null;
}

/** Groups tasks into queued, in progress, then done. Empty groups are omitted. */
export function groupProjectsIndexTasks(
  issues: readonly ProjectIssueListItem[],
): { items: ProjectIssueListItem[]; word: TaskStatusWord }[] {
  const grouped = new Map<TaskStatusWord, ProjectIssueListItem[]>();
  for (const item of issues) {
    const word = taskStatusWord(item.issue.status);
    const bucket = grouped.get(word);
    if (bucket) bucket.push(item);
    else grouped.set(word, [item]);
  }
  return TASK_STATUS_WORDS.flatMap((word) => {
    const items = grouped.get(word);
    return items && items.length > 0 ? [{ items, word }] : [];
  });
}

function lastMessageAtSeconds(value: string | null | undefined) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1_000) : null;
}

function sortRepositories(
  repositories: readonly Repository[],
  sort: ProjectsSort,
) {
  return [...repositories].sort((left, right) => {
    if (sort === "name") return left.name.localeCompare(right.name);
    return right.createdAt - left.createdAt;
  });
}

/**
 * One node per project already on the index. Repositories stay in the
 * mainline/subrepository order `nestRepositoryListRows` produces. Search
 * uses the same fields the old tabs matched. A subrepository hit keeps its
 * mainline so the indent still has a parent.
 */
export function buildProjectsIndexTree({
  channelsById,
  issues,
  projects,
  searchQuery,
  sort,
}: {
  channelsById: ReadonlyMap<string, ProjectsIndexChannel>;
  issues: readonly ProjectIssueListItem[];
  projects: readonly Project[];
  searchQuery: string;
  sort: ProjectsSort;
}): ProjectsIndexTreeNode[] {
  const issuesByProject = new Map<string, ProjectIssueListItem[]>();
  for (const item of issues) {
    const list = issuesByProject.get(item.project.id);
    if (list) list.push(item);
    else issuesByProject.set(item.project.id, [item]);
  }

  const nodes: ProjectsIndexTreeNode[] = [];
  for (const project of projects) {
    const nested = nestRepositoryListRows(
      sortRepositories(project.repositories, sort).map((repository) => ({
        project,
        repository,
      })),
    );
    const repositoryKeep = new Set<string>();
    for (const item of nested) {
      const matches = matchesProjectsSearch(searchQuery, [
        item.row.repository.name,
        item.row.repository.description,
        project.name,
      ]);
      if (!matches) continue;
      repositoryKeep.add(item.row.repository.repoAddress);
      if (item.role.kind === "subrepository") {
        repositoryKeep.add(item.role.mainlineAddress);
      }
    }
    const repositories = nested.filter((item) =>
      repositoryKeep.has(item.row.repository.repoAddress),
    );

    const channels = collapseProjectRelatedChannelRows(
      collectProjectRelatedChannelRows([project]),
    )
      .filter((row) => {
        const channel = channelsById.get(row.channelId);
        return matchesProjectsSearch(searchQuery, [
          channel?.name,
          channel?.description,
          project.name,
          ...row.repositoryNames,
        ]);
      })
      .sort((left, right) => {
        const leftChannel = channelsById.get(left.channelId);
        const rightChannel = channelsById.get(right.channelId);
        const leftName = leftChannel?.name ?? "";
        const rightName = rightChannel?.name ?? "";
        const leftActivity =
          lastMessageAtSeconds(leftChannel?.lastMessageAt) ?? 0;
        const rightActivity =
          lastMessageAtSeconds(rightChannel?.lastMessageAt) ?? 0;
        return (
          rightActivity - leftActivity ||
          leftName.localeCompare(rightName) ||
          left.channelId.localeCompare(right.channelId)
        );
      });

    const projectIssues = (issuesByProject.get(project.id) ?? []).filter(
      ({ issue, repository }) =>
        matchesProjectsSearch(searchQuery, [
          issue.title,
          issue.content,
          issue.status,
          taskStatusWord(issue.status),
          project.name,
          repository.name,
        ]),
    );

    const projectListed = matchesProjectsSearch(searchQuery, [
      project.name,
      project.description,
    ]);
    if (
      !projectListed &&
      repositories.length === 0 &&
      channels.length === 0 &&
      projectIssues.length === 0
    ) {
      continue;
    }

    nodes.push({
      channels,
      issues: projectIssues,
      project,
      repositories,
    });
  }
  return nodes;
}
