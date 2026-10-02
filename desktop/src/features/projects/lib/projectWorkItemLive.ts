import {
  KIND_GIT_ISSUE,
  KIND_GIT_PR_UPDATE,
  KIND_GIT_PULL_REQUEST,
  KIND_GIT_STATUS_CLOSED,
  KIND_GIT_STATUS_DRAFT,
  KIND_GIT_STATUS_MERGED,
  KIND_GIT_STATUS_OPEN,
} from "@/shared/constants/kinds";

/** Kinds that create a task or review, or move one between columns. */
export const PROJECT_WORK_ITEM_LIVE_KINDS = [
  KIND_GIT_ISSUE,
  KIND_GIT_PULL_REQUEST,
  KIND_GIT_PR_UPDATE,
  KIND_GIT_STATUS_OPEN,
  KIND_GIT_STATUS_MERGED,
  KIND_GIT_STATUS_CLOSED,
  KIND_GIT_STATUS_DRAFT,
] as const;

type RepositorySource = {
  repositories: readonly { repoAddress: string }[];
};

/** Sorted repository addresses a live task subscription should follow. */
export function projectWorkItemRepoAddresses(
  projects: readonly RepositorySource[],
): string[] {
  return [
    ...new Set(
      projects.flatMap((project) =>
        project.repositories.map((repository) => repository.repoAddress),
      ),
    ),
  ].sort();
}

/** Live-only filter. `limit: 0` asks the relay for new events, not history. */
export function projectWorkItemLiveFilter(repoAddresses: readonly string[]) {
  return {
    kinds: [...PROJECT_WORK_ITEM_LIVE_KINDS],
    "#a": [...repoAddresses],
    limit: 0,
  };
}

export function projectWorkItemEventMatchesAddresses(
  event: { tags: readonly (readonly string[])[] },
  repoAddresses: ReadonlySet<string>,
): boolean {
  const address = event.tags.find((tag) => tag[0] === "a")?.[1];
  return typeof address === "string" && repoAddresses.has(address);
}

/** Task and review queries a live git event should refresh. */
export function isProjectWorkItemQueryKey(
  queryKey: readonly unknown[],
): boolean {
  if (queryKey[0] === "projects") {
    return queryKey[1] === "work-items" || queryKey[1] === "activity-summaries";
  }
  if (queryKey[0] === "project") {
    return queryKey[2] === "issues" || queryKey[2] === "pull-requests";
  }
  return false;
}
