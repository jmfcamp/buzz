import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import type { Repository } from "@/features/projects/hooks";
import {
  branchFromCheckoutStatus,
  checkoutWorkSource,
  repositoryRowBranch,
  type CheckoutWork,
} from "@/features/projects/lib/checkoutWork";
import { loadHulaHeadBranch } from "@/features/projects/lib/hulaCheckout";
import { loadCheckoutWork } from "@/features/projects/useCheckoutWork";
import { hulaGitExec } from "@/features/projects/useHulaRepositoryGit";
import { getProjectCheckoutWork } from "@/shared/api/projectGit";
import { cn } from "@/shared/lib/cn";

const META_BUTTON_CLASS =
  "inline-flex max-w-36 shrink-0 items-center truncate rounded border border-border/70 bg-muted/40 px-1.5 py-px text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

type RowCommit = { hash: string; shortHash: string; subject: string };

/**
 * Checked-out branch for one index row.
 * Uses checkout work when that query is already loaded. Otherwise reads
 * through the existing status command: `loadHulaHeadBranch` for an OpenClaw
 * checkout, and `getProjectCheckoutWork` for a local clone. No new git flags.
 */
export function useRepositoryRowBranch(repository: Repository): string | null {
  const source = React.useMemo(
    () =>
      checkoutWorkSource(
        { hulaPath: repository.hulaPath, repositories: [repository] },
        repository,
      ),
    [repository],
  );
  const workQuery = useQuery({
    enabled: false,
    queryKey: ["checkout-work", source],
    queryFn: () => (source ? loadCheckoutWork(source) : null),
  });
  const root = source?.kind === "hula" ? source.root : null;
  const checkoutLoaded = workQuery.isSuccess && workQuery.data != null;
  const headQuery = useQuery({
    enabled: Boolean(root) && !checkoutLoaded,
    queryKey: ["hula-head", root],
    queryFn: () => (root ? loadHulaHeadBranch(root, hulaGitExec) : null),
    retry: 1,
    staleTime: 30_000,
  });
  const localQuery = useQuery({
    enabled: source?.kind === "local" && !checkoutLoaded,
    queryKey: ["repository-row-checkout-branch", source],
    queryFn: async () => {
      if (source?.kind !== "local") return null;
      const raw = await getProjectCheckoutWork({
        cloneUrl: source.cloneUrl,
        projectDtag: source.projectDtag,
      });
      if (!raw) return null;
      return branchFromCheckoutStatus(raw.status);
    },
    retry: 1,
    staleTime: 30_000,
  });
  const statusQuery = source?.kind === "local" ? localQuery : headQuery;
  return repositoryRowBranch({
    checkoutWork: checkoutLoaded
      ? (workQuery.data as CheckoutWork)
      : workQuery.isSuccess
        ? null
        : undefined,
    statusBranch:
      source == null
        ? null
        : checkoutLoaded
          ? undefined
          : statusQuery.isSuccess
            ? (statusQuery.data ?? null)
            : statusQuery.isError
              ? null
              : undefined,
  });
}

/** Commit id, then the checked-out branch on its right. Nothing when both are absent. */
export function RepositoryRowMeta({
  commit,
  onOpenBranch,
  onOpenCommit,
  repository,
}: {
  commit: RowCommit | null;
  onOpenBranch: () => void;
  onOpenCommit: () => void;
  repository: Repository;
}) {
  const branch = useRepositoryRowBranch(repository);
  if (!commit && !branch) return null;
  return (
    <span className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
      {commit ? (
        <button
          className={META_BUTTON_CLASS}
          data-testid="repository-row-commit"
          onClick={(event) => {
            event.stopPropagation();
            onOpenCommit();
          }}
          title={commit.subject || commit.hash}
          type="button"
        >
          {commit.shortHash}
        </button>
      ) : null}
      {branch ? (
        <button
          className={cn(META_BUTTON_CLASS, "max-w-28")}
          data-testid="repository-row-branch"
          onClick={(event) => {
            event.stopPropagation();
            onOpenBranch();
          }}
          title={branch}
          type="button"
        >
          {branch}
        </button>
      ) : null}
    </span>
  );
}
