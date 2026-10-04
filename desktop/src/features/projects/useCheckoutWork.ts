import { useQuery } from "@tanstack/react-query";

import {
  CHECKOUT_EMPTY_TREES,
  CHECKOUT_NUMSTAT_ARGV,
  CHECKOUT_STATUS_ARGV,
  checkoutCommitNumstatArgv,
  checkoutLogArgv,
  commitWithNumstat,
  parseCheckoutWork,
  type CheckoutCommitStat,
  type CheckoutWork,
  type CheckoutWorkSource,
} from "@/features/projects/lib/checkoutWork";
import { hulaDirectoryPath } from "@/features/projects/lib/hulaProjectNames";
import { hulaGitExec } from "@/features/projects/useHulaRepositoryGit";
import { getProjectCheckoutWork } from "@/shared/api/projectGit";
import { useFocusedRefetchInterval } from "@/shared/lib/useDocumentVisible";

async function readHulaGit(
  argv: readonly string[],
  cwd: string,
): Promise<string> {
  const result = await hulaGitExec(argv, cwd);
  if (typeof result.exitCode === "number" && result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "Could not read the checkout.");
  }
  return result.stdout;
}

const MISSING_PARENT = /unknown revision|bad revision|ambiguous argument/i;

/**
 * Line counts for one commit.
 * A missing parent retries against the empty tree.
 * Any other refusal is skipped so the commit list still renders.
 */
async function readCommitNumstat(
  root: string,
  hash: string,
): Promise<string | null> {
  const parents = [`${hash}~1`, ...CHECKOUT_EMPTY_TREES];
  for (const [index, parent] of parents.entries()) {
    const argv = checkoutCommitNumstatArgv(
      hash,
      index === 0 ? undefined : parent,
    );
    if (!argv) return null;
    try {
      return await readHulaGit(argv, root);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!MISSING_PARENT.test(message)) return null;
    }
  }
  return null;
}

/** Fill per-commit files from `git diff --numstat`. A failed diff omits those counts. */
async function withHulaCommitNumstats(
  root: string,
  commits: readonly CheckoutCommitStat[],
): Promise<CheckoutCommitStat[]> {
  return Promise.all(
    commits.map(async (commit) => {
      const numstat = await readCommitNumstat(root, commit.hash);
      return numstat == null ? commit : commitWithNumstat(commit, numstat);
    }),
  );
}

/** Read-only status, `git diff --numstat`, and an allowlisted `git log`. */
export async function loadCheckoutWork(
  source: CheckoutWorkSource,
): Promise<CheckoutWork | null> {
  if (source.kind === "hula") {
    const root = hulaDirectoryPath(source.root);
    if (!root) throw new Error("Choose a directory inside Hula.");
    const [status, numstat, log] = await Promise.all([
      readHulaGit(CHECKOUT_STATUS_ARGV, root),
      readHulaGit(CHECKOUT_NUMSTAT_ARGV, root),
      readHulaGit(checkoutLogArgv(), root),
    ]);
    const work = parseCheckoutWork(root, status, numstat, log);
    work.commits = await withHulaCommitNumstats(root, work.commits);
    return work;
  }
  const raw = await getProjectCheckoutWork({
    projectDtag: source.projectDtag,
    cloneUrl: source.cloneUrl,
  });
  if (!raw) return null;
  return parseCheckoutWork(raw.path, raw.status, raw.numstat, raw.log);
}

export function useCheckoutWork(source: CheckoutWorkSource | null) {
  const refetchInterval = useFocusedRefetchInterval(8_000);
  return useQuery({
    enabled: source != null,
    queryKey: ["checkout-work", source],
    queryFn: () => (source ? loadCheckoutWork(source) : null),
    refetchInterval,
    retry: 1,
    staleTime: 2_000,
  });
}
