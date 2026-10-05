import { useQueries, useQuery } from "@tanstack/react-query";

import type { Repository } from "@/features/projects/hooks";
import type { ProjectRepositorySnapshotResult } from "@/features/projects/useProjectRepositorySnapshots";
import type { ProjectRepoSnapshot } from "@/shared/api/projectGitTypes";
import {
  loadHulaBranches,
  loadHulaHeadBranch,
} from "@/features/projects/lib/hulaCheckout";
import {
  loadHulaAllCommits,
  loadHulaCommit,
  loadHulaCommitDiff,
  loadHulaFilesSnapshot,
  loadHulaReviewDiff,
} from "@/features/projects/lib/hulaFiles";
import {
  callOpenClawWorkspaceTool,
  openClawWorkspaceClient,
} from "@/features/projects/lib/openClawWorkspaceClient";

const NO_BRANCHES: string[] = [];

/** Run one allowlisted git command in an OpenClaw checkout. */
export function hulaGitExec(
  argv: readonly string[],
  cwd: string,
): ReturnType<typeof openClawWorkspaceClient.exec> {
  return openClawWorkspaceClient.exec([...argv], cwd);
}

/** Checked-out branch and local heads. Disabled when `root` is null. */
export function useHulaRepositoryRefs(root: string | null) {
  const headQuery = useQuery({
    enabled: Boolean(root),
    queryKey: ["hula-head", root],
    queryFn: () => (root ? loadHulaHeadBranch(root, hulaGitExec) : null),
    staleTime: 30_000,
    retry: 1,
  });
  const branchesQuery = useQuery({
    enabled: Boolean(root),
    queryKey: ["hula-branches", root],
    queryFn: () => (root ? loadHulaBranches(root, hulaGitExec) : []),
    staleTime: 30_000,
    retry: 1,
  });
  return {
    branches: branchesQuery.data ?? NO_BRANCHES,
    branchesQuery,
    error: headQuery.error ?? branchesQuery.error,
    headBranch: headQuery.data ?? null,
    headQuery,
    isFetching: headQuery.isFetching || branchesQuery.isFetching,
    refetch: () => Promise.all([headQuery.refetch(), branchesQuery.refetch()]),
  };
}

/**
 * Git snapshot of one OpenClaw ref.
 * The query key matches the Files tab, so both views share one read.
 * `HEAD` lists the worktree on disk; other refs use the tracked tree.
 * This does not check out.
 */
export function useHulaFilesSnapshot(root: string | null, gitRef: string) {
  const ref = gitRef.trim() || "HEAD";
  return useQuery({
    enabled: Boolean(root),
    queryKey: ["hula-files", root, ref],
    queryFn: () =>
      root
        ? loadHulaFilesSnapshot(root, hulaGitExec, {
            list: callOpenClawWorkspaceTool,
            ref,
          })
        : null,
    retry: 1,
    staleTime: 30_000,
  });
}

/**
 * Files changed for one review.
 * The base is the review target, not the branch selected in the workspace.
 */
export function useHulaReviewDiff(
  root: string | null,
  base: string | null,
  head: string | null,
) {
  return useQuery({
    enabled: Boolean(root && base && head),
    queryKey: ["hula-review-diff", root, base, head],
    queryFn: () =>
      root && base && head
        ? loadHulaReviewDiff(root, base, head, hulaGitExec)
        : null,
    retry: 1,
    staleTime: 30_000,
  });
}

/** One commit and its parent diff. A missing hash leaves both queries idle. */
export function useHulaCommitDetail(root: string | null, hash: string | null) {
  const commitQuery = useQuery({
    enabled: Boolean(root && hash),
    queryKey: ["hula-commit", root, hash],
    queryFn: () =>
      root && hash ? loadHulaCommit(root, hash, hulaGitExec) : null,
    retry: 1,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const diffQuery = useQuery({
    enabled: Boolean(root && hash),
    queryKey: ["hula-commit-diff", root, hash],
    queryFn: () =>
      root && hash ? loadHulaCommitDiff(root, hash, hulaGitExec) : null,
    retry: 1,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return { commitQuery, diffQuery };
}

/** One OpenClaw checkout's commits from `git log --all`. */
export type HulaAllCommitList = {
  commits: ProjectRepoSnapshot["commits"];
  error: unknown;
  isLoading: boolean;
  root: string;
  truncated: boolean;
};

/**
 * Every local commit for each OpenClaw root.
 * Idle until `enabled` is true. A failed root stays an error, not an empty list.
 */
export function useHulaAllCommitLists(
  roots: readonly string[],
  enabled: boolean,
): HulaAllCommitList[] {
  const queries = useQueries({
    queries: roots.map((root) => ({
      enabled: enabled && root.length > 0,
      queryKey: ["hula-all-commits", root],
      queryFn: () => loadHulaAllCommits(root, hulaGitExec),
      retry: 1,
      staleTime: 30_000,
    })),
  });
  return roots.map((root, index) => {
    const query = queries[index];
    return {
      commits: query?.data?.commits ?? [],
      error: query?.error ?? null,
      isLoading: query?.isLoading ?? false,
      root,
      truncated: query?.data?.truncated === true,
    };
  });
}

/** One OpenClaw snapshot per repository. A missing path stays a row error. */
export function useHulaRepositorySnapshots(
  repositories: Repository[],
  enabled = true,
): ProjectRepositorySnapshotResult[] {
  const queries = useQueries({
    queries: repositories.map((repository) => {
      const root = repository.hulaPath ?? null;
      return {
        enabled: Boolean(enabled && root),
        queryFn: (): Promise<ProjectRepoSnapshot | null> =>
          root
            ? loadHulaFilesSnapshot(root, hulaGitExec, {
                list: callOpenClawWorkspaceTool,
                ref: "HEAD",
              })
            : Promise.resolve(null),
        queryKey: ["hula-files", root, "HEAD"],
        retry: 1,
        staleTime: 30_000,
      };
    }),
  });
  return repositories.map((repository, index) => {
    const query = queries[index];
    return {
      error:
        enabled && !repository.hulaPath
          ? new Error("This repository has no OpenClaw path.")
          : query?.error,
      isLoading: query?.isLoading ?? false,
      repository,
      snapshot: query?.data ?? null,
    };
  });
}
