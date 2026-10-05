import { hulaGitRef } from "@/features/projects/lib/hulaFiles";
import { hulaDirectoryPath } from "@/features/projects/lib/hulaProjectNames";

/** Local branch names. Tags are not part of this read. */
export const HULA_BRANCHES_ARGV = [
  "git",
  "for-each-ref",
  "--format=%(refname:short)",
  "refs/heads",
] as const;

/** Checked-out branch. This does not move HEAD. */
export const HULA_HEAD_ARGV = ["git", "status", "-sb"] as const;

type ExecCall = (
  argv: readonly string[],
  cwd: string,
) => Promise<{ stdout: string; stderr: string; exitCode: number | null }>;

/** Branch names from `git for-each-ref`. Names that cannot be read are dropped. */
export function parseHulaBranchNames(stdout: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const name = line.trim();
    if (!name || seen.has(name)) continue;
    try {
      hulaGitRef(name);
    } catch {
      continue;
    }
    seen.add(name);
    names.push(name);
  }
  return names;
}

/** Local heads of one OpenClaw checkout. This does not change the checkout. */
export async function loadHulaBranches(
  root: string,
  exec: ExecCall,
): Promise<string[]> {
  const normalized = hulaDirectoryPath(root);
  if (!normalized) throw new Error("Choose a directory inside Hula.");
  const result = await exec(HULA_BRANCHES_ARGV, normalized);
  if (typeof result.exitCode === "number" && result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "Could not list branches.");
  }
  return parseHulaBranchNames(result.stdout);
}

/**
 * Branch that is checked out now.
 * Detached HEAD returns null. This does not change the checkout.
 */
export async function loadHulaHeadBranch(
  root: string,
  exec: ExecCall,
): Promise<string | null> {
  const normalized = hulaDirectoryPath(root);
  if (!normalized) throw new Error("Choose a directory inside Hula.");
  const result = await exec(HULA_HEAD_ARGV, normalized);
  if (typeof result.exitCode === "number" && result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "Could not read the checkout.");
  }
  const name = branchFromGitStatus(result.stdout);
  if (!name) return null;
  try {
    return hulaGitRef(name);
  } catch {
    return null;
  }
}

/** Branch from `git status -sb`. Detached HEAD has no branch name. */
export function branchFromGitStatus(stdout: string): string | null {
  const line = stdout.split(/\r?\n/).find((row) => row.startsWith("## "));
  if (!line) return null;
  const rest = line.slice(3).trim();
  if (!rest || rest.startsWith("HEAD (no branch)")) return null;
  const name = rest.split("...")[0]?.trim() ?? "";
  return name || null;
}

export type WorktreeRecord = {
  path: string;
  head: string | null;
  /** Short branch name. Null when detached or missing. */
  branch: string | null;
  detached: boolean;
  /** True when `git worktree list` marks the worktree prunable. */
  prunable: boolean;
};

/** Parse `git worktree list --porcelain`. */
export function parseWorktreePorcelain(text: string): WorktreeRecord[] {
  const records: WorktreeRecord[] = [];
  let current: WorktreeRecord | null = null;
  const flush = () => {
    if (current?.path) records.push(current);
    current = null;
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.startsWith("worktree ")) {
      flush();
      current = {
        path: line.slice("worktree ".length),
        head: null,
        branch: null,
        detached: false,
        prunable: false,
      };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length);
      current.branch = ref.startsWith("refs/heads/")
        ? ref.slice("refs/heads/".length)
        : ref;
    } else if (line === "detached") {
      current.detached = true;
    } else if (line.startsWith("prunable")) {
      current.prunable = true;
    }
  }
  flush();
  return records;
}

export type HulaRepoCheckout = {
  repositoryId: string;
  name: string;
  hulaPath: string;
  branch: string;
};

export type HulaWorktreeCheckout = {
  repositoryId: string;
  repoName: string;
  path: string;
  branch: string;
};

/**
 * Repo rows are the checkouts at each member path.
 * Other worktrees of those repos stay in their own list.
 * Both rows carry the member repository id. Nothing here checks out a branch.
 */
export function hulaCheckoutRows(
  repos: readonly {
    repositoryId: string;
    name: string;
    hulaPath: string;
    worktrees: readonly WorktreeRecord[];
  }[],
): { repos: HulaRepoCheckout[]; worktrees: HulaWorktreeCheckout[] } {
  const repoRows: HulaRepoCheckout[] = [];
  const worktreeRows: HulaWorktreeCheckout[] = [];
  for (const repo of repos) {
    const main =
      repo.worktrees.find(
        (record) => hulaDirectoryPath(record.path) === repo.hulaPath,
      ) ?? repo.worktrees[0];
    repoRows.push({
      repositoryId: repo.repositoryId,
      name: repo.name,
      hulaPath: repo.hulaPath,
      branch: branchLabel(main),
    });
    for (const record of repo.worktrees) {
      if (main && record.path === main.path) continue;
      const relative = hulaDirectoryPath(record.path);
      worktreeRows.push({
        repositoryId: repo.repositoryId,
        repoName: repo.name,
        path: relative ?? record.path,
        branch: branchLabel(record),
      });
    }
  }
  return { repos: repoRows, worktrees: worktreeRows };
}

function branchLabel(record: WorktreeRecord | undefined): string {
  if (!record) return "unknown";
  if (record.detached || !record.branch) return "detached";
  return record.branch;
}
