import { useQuery } from "@tanstack/react-query";

import {
  CHECKOUT_BRANCH_LIST_ARGV,
  CHECKOUT_EMPTY_TREES,
  CHECKOUT_NUMSTAT_ARGV,
  CHECKOUT_STATUS_ARGV,
  CHECKOUT_STATUS_ARGV_NO_IGNORED,
  CHECKOUT_WORKTREE_LIST_ARGV,
  checkoutBranchUniqueCountArgv,
  checkoutCommitNumstatArgv,
  checkoutLogArgv,
  checkoutRefLogArgv,
  checkoutSelectionId,
  checkoutUniqueLogArgv,
  checkoutWorktreeLabel,
  commitWithNumstat,
  isCheckoutSelectionStale,
  isDefaultBranchSelection,
  isFileLikePathSegment,
  parseCheckoutWork,
  parseGitMediumNumstat,
  parseLocalBranchList,
  parseRevListCount,
  type CheckoutCommitStat,
  type CheckoutRailCatalog,
  type CheckoutRailSelection,
  type CheckoutSelectionDetail,
  type CheckoutWork,
  type CheckoutWorkSource,
} from "@/features/projects/lib/checkoutWork";
import {
  parseWorktreePorcelain,
  type WorktreeRecord,
} from "@/features/projects/lib/hulaCheckout";
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

/** Soft read: non-zero exit returns null instead of throwing. */
async function tryReadHulaGit(
  argv: readonly string[],
  cwd: string,
): Promise<string | null> {
  try {
    const result = await hulaGitExec(argv, cwd);
    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      return null;
    }
    return result.stdout;
  } catch {
    return null;
  }
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
    const status =
      (await tryReadHulaGit(CHECKOUT_STATUS_ARGV, root)) ??
      (await readHulaGit(CHECKOUT_STATUS_ARGV_NO_IGNORED, root));
    const [numstat, log] = await Promise.all([
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

function defaultBranchCandidates(
  announced: string | null | undefined,
): string[] {
  return [announced?.trim() || "", "main", "master"].filter(
    (name, index, all) => Boolean(name) && all.indexOf(name) === index,
  );
}

async function resolveDefaultBranch(
  root: string,
  announced: string | null | undefined,
): Promise<string> {
  for (const name of defaultBranchCandidates(announced)) {
    const argv = checkoutBranchUniqueCountArgv(name, name);
    if (!argv) continue;
    const stdout = await tryReadHulaGit(argv, root);
    if (stdout != null) return name;
  }
  return defaultBranchCandidates(announced)[0] || "main";
}

async function countUniqueOnRef(
  root: string,
  defaultBranch: string,
  ref: string,
): Promise<number> {
  const argv = checkoutBranchUniqueCountArgv(defaultBranch, ref);
  if (!argv) return 0;
  const stdout = await tryReadHulaGit(argv, root);
  if (stdout == null) return 0;
  return parseRevListCount(stdout);
}

async function loadUniqueCommits(
  root: string,
  defaultBranch: string,
  ref: string,
): Promise<CheckoutCommitStat[]> {
  const argv = checkoutUniqueLogArgv(defaultBranch, ref);
  if (!argv) return [];
  const log = await tryReadHulaGit(argv, root);
  if (log == null) return [];
  const commits = parseGitMediumNumstat(log);
  return withHulaCommitNumstats(root, commits);
}

/** Latest history of one ref (default-branch row), same parsing as unique commits. */
async function loadRefCommits(
  root: string,
  ref: string,
): Promise<CheckoutCommitStat[]> {
  const argv = checkoutRefLogArgv(ref);
  if (!argv) return [];
  const log = await tryReadHulaGit(argv, root);
  if (log == null) return [];
  // No per-commit numstat here: main's history would cost one remote call per commit.
  return parseGitMediumNumstat(log);
}

function worktreeRoot(
  record: WorktreeRecord,
  primaryRoot: string,
): string | null {
  const raw = record.path.trim();
  if (!raw) return null;
  // Never treat a filename (e.g. research-test.md) as a worktree directory.
  if (isFileLikePathSegment(raw)) return null;
  const viaHula = hulaDirectoryPath(raw);
  if (viaHula) {
    if (isFileLikePathSegment(viaHula)) return null;
    return viaHula;
  }
  if (raw === primaryRoot) return primaryRoot;
  return null;
}

type WorktreeInfo = {
  root: string;
  displayPath: string;
  branch: string | null;
  primary: boolean;
  prunable: boolean;
  branchGone: boolean;
  work: CheckoutWork | null;
};

/**
 * Branches + worktrees catalog for the project chat checkout rail.
 * Does not load per-selection file/commit detail (that is selection-scoped).
 */
export async function loadCheckoutRailCatalog(
  source: CheckoutWorkSource,
  defaultBranchHint?: string | null,
): Promise<CheckoutRailCatalog | null> {
  if (source.kind !== "hula") {
    const work = await loadCheckoutWork(source);
    if (!work) return null;
    const currentName = work.branch?.trim() || "detached";
    const unique = work.aheadCount ?? 0;
    const dirty = work.files.length;
    const stale = isCheckoutSelectionStale({
      uniqueCommitCount: unique,
      dirtyFileCount: dirty,
    });
    const selection: CheckoutRailSelection = {
      id: checkoutSelectionId("branch", currentName),
      kind: "branch",
      label: currentName,
      section: stale ? "stale-branches" : "branches",
      stale,
      checkoutPath: work.root,
      branch: work.branch,
      uniqueCommitCount: unique,
      dirtyFileCount: dirty,
    };
    return {
      primaryPath: work.root,
      primaryDisplayPath: work.root,
      currentName,
      defaultBranch: defaultBranchHint?.trim() || "main",
      selections: [selection],
    };
  }

  const primaryRoot = hulaDirectoryPath(source.root);
  if (!primaryRoot) throw new Error("Choose a directory inside Hula.");

  let records: WorktreeRecord[] = [];
  try {
    const listed = await readHulaGit(CHECKOUT_WORKTREE_LIST_ARGV, primaryRoot);
    records = parseWorktreePorcelain(listed);
  } catch {
    records = [];
  }
  if (records.length === 0) {
    records = [
      {
        path: primaryRoot,
        head: null,
        branch: null,
        detached: false,
        prunable: false,
      },
    ];
  }

  const defaultBranch = await resolveDefaultBranch(
    primaryRoot,
    defaultBranchHint,
  );

  const worktrees: WorktreeInfo[] = [];
  for (const record of records) {
    const root = worktreeRoot(record, primaryRoot);
    if (!root) continue;
    const primary = root === primaryRoot;
    let work: CheckoutWork | null = null;
    try {
      work = await loadCheckoutWork({ kind: "hula", root });
    } catch {
      work = null;
    }
    const branch = work?.branch ?? record.branch;
    worktrees.push({
      root,
      displayPath: record.path,
      branch,
      primary,
      prunable: record.prunable,
      branchGone: Boolean(
        !record.prunable && (record.detached || !branch) && !primary,
      ),
      work,
    });
  }

  let primary = worktrees.find((entry) => entry.root === primaryRoot) ?? null;
  if (primary) {
    for (const entry of worktrees) {
      entry.primary = entry.root === primary.root;
    }
  } else {
    // Porcelain path failed to normalize — still seed the primary checkout.
    let work: CheckoutWork | null = null;
    try {
      work = await loadCheckoutWork({ kind: "hula", root: primaryRoot });
    } catch {
      work = null;
    }
    primary = {
      root: primaryRoot,
      displayPath: primaryRoot,
      branch: work?.branch ?? null,
      primary: true,
      prunable: false,
      branchGone: false,
      work,
    };
    worktrees.unshift(primary);
  }

  const branchListStdout = await tryReadHulaGit(
    CHECKOUT_BRANCH_LIST_ARGV,
    primaryRoot,
  );
  const localBranches = branchListStdout
    ? parseLocalBranchList(branchListStdout)
    : [];
  const branchNames = new Set(localBranches);
  for (const entry of worktrees) {
    if (entry.branch) branchNames.add(entry.branch);
  }

  // Linked worktrees only (exclude primary). Primary is a Checkout row.
  const linkedWorktrees = worktrees.filter((entry) => !entry.primary);
  const checkedOutInLinked = new Set(
    linkedWorktrees.map((entry) => entry.branch?.trim() || "").filter(Boolean),
  );

  const selections: CheckoutRailSelection[] = [];

  if (!primary) {
    throw new Error("Primary checkout is required.");
  }
  const primaryEntry = primary;
  const primaryBranch = primaryEntry.work?.branch ?? primaryEntry.branch;
  const primaryOnDefault =
    Boolean(primaryBranch) && primaryBranch === defaultBranch;

  // 1) Default branch first (usually "main") — shows that ref's tree/commits,
  // even when HEAD is a feature branch. When HEAD is the default, attach the
  // primary checkout so Current + working tree appear on this row too.
  // Never mark the default branch "stale" (unique vs itself is always 0).
  {
    const name = defaultBranch;
    branchNames.add(name);
    const unique = await countUniqueOnRef(primaryRoot, defaultBranch, name);
    const dirty = primaryOnDefault ? (primaryEntry.work?.files.length ?? 0) : 0;
    const stale = false;
    selections.push({
      id: checkoutSelectionId("branch", name),
      kind: "branch",
      label: name,
      section: "branches",
      stale,
      checkoutPath: primaryOnDefault ? primaryRoot : null,
      branch: name,
      uniqueCommitCount: unique,
      dirtyFileCount: dirty,
    });
  }

  // 2) Primary working tree as Checkout (separate from the default branch row).
  {
    const branch = primaryBranch;
    const unique = branch
      ? await countUniqueOnRef(primaryRoot, defaultBranch, branch)
      : 0;
    const dirty = primaryEntry.work?.files.length ?? 0;
    const stale = isCheckoutSelectionStale({
      uniqueCommitCount: unique,
      dirtyFileCount: dirty,
    });
    selections.push({
      id: checkoutSelectionId("checkout", primaryRoot),
      kind: "checkout",
      label: checkoutWorktreeLabel(primaryRoot),
      section: "branches",
      stale,
      checkoutPath: primaryRoot,
      branch,
      uniqueCommitCount: unique,
      dirtyFileCount: dirty,
    });
  }

  // Linked worktrees only — omit Worktrees section when none remain.
  for (const entry of linkedWorktrees) {
    const label = checkoutWorktreeLabel(entry.root);
    const unique = entry.branch
      ? await countUniqueOnRef(primaryRoot, defaultBranch, entry.branch)
      : entry.work
        ? await countUniqueOnRef(entry.root, defaultBranch, "HEAD")
        : 0;
    const dirty = entry.work?.files.length ?? 0;
    const stale = isCheckoutSelectionStale({
      uniqueCommitCount: unique,
      dirtyFileCount: dirty,
      prunable: entry.prunable,
      branchGone: entry.branchGone,
    });
    selections.push({
      id: checkoutSelectionId("worktree", entry.root),
      kind: "worktree",
      label,
      section: stale ? "stale-worktrees" : "worktrees",
      stale,
      checkoutPath: entry.root,
      branch: entry.branch,
      uniqueCommitCount: unique,
      dirtyFileCount: dirty,
    });
  }

  // Other local branches (not the default, not checked out in a linked worktree).
  for (const name of [...branchNames].sort()) {
    if (name === defaultBranch) continue;
    if (checkedOutInLinked.has(name)) continue;
    const unique = await countUniqueOnRef(primaryRoot, defaultBranch, name);
    const stale = isCheckoutSelectionStale({
      uniqueCommitCount: unique,
      dirtyFileCount: 0,
    });
    selections.push({
      id: checkoutSelectionId("branch", name),
      kind: "branch",
      label: name,
      section: stale ? "stale-branches" : "branches",
      stale,
      checkoutPath: null,
      branch: name,
      uniqueCommitCount: unique,
      dirtyFileCount: 0,
    });
  }

  const currentName =
    primary?.work?.branch?.trim() ||
    primary?.branch?.trim() ||
    (primary?.work ? "detached" : "unknown");

  return {
    primaryPath: primaryRoot,
    primaryDisplayPath: primary?.displayPath ?? primaryRoot,
    currentName,
    defaultBranch,
    selections,
  };
}

/**
 * Files and unique commits for one Branches/Worktrees selection.
 * A local branch with no checkout reports `noWorkingTree` instead of files.
 */
export async function loadCheckoutSelectionDetail(
  source: CheckoutWorkSource,
  catalog: CheckoutRailCatalog,
  selectionId: string,
): Promise<CheckoutSelectionDetail | null> {
  const selection =
    catalog.selections.find((entry) => entry.id === selectionId) ?? null;
  if (!selection) return null;

  if (source.kind !== "hula") {
    const work = await loadCheckoutWork(source);
    if (!work) return null;
    return {
      files: work.files,
      noWorkingTree: false,
      commits: work.commits,
      work,
    };
  }

  const root = hulaDirectoryPath(source.root);
  if (!root) return null;

  if (selection.kind === "branch") {
    const branch = selection.branch;
    if (!branch) return null;
    // Default-branch row lists that branch's recent history, not "ahead".
    const commits = isDefaultBranchSelection(selection, catalog)
      ? await loadRefCommits(root, branch)
      : await loadUniqueCommits(root, catalog.defaultBranch, branch);
    if (!selection.checkoutPath) {
      return {
        files: [],
        noWorkingTree: true,
        commits,
        work: null,
      };
    }
    let work: CheckoutWork | null = null;
    try {
      work = await loadCheckoutWork({
        kind: "hula",
        root: selection.checkoutPath,
      });
    } catch {
      work = null;
    }
    // Only use files when that checkout is still on this branch.
    const onBranch = work?.branch === branch;
    return {
      files: onBranch ? (work?.files ?? []) : [],
      noWorkingTree: !onBranch,
      commits,
      work: onBranch ? work : null,
    };
  }

  // Checkout (primary) or linked worktree selection.
  const checkoutPath = selection.checkoutPath;
  if (!checkoutPath) {
    return {
      files: [],
      noWorkingTree: true,
      commits: [],
      work: null,
    };
  }
  let work: CheckoutWork | null = null;
  try {
    work = await loadCheckoutWork({ kind: "hula", root: checkoutPath });
  } catch {
    work = null;
  }
  const ref = selection.branch?.trim() || "HEAD";
  const commits = await loadUniqueCommits(
    checkoutPath,
    catalog.defaultBranch,
    ref === "HEAD" ? "HEAD" : ref,
  );
  return {
    files: work?.files ?? [],
    noWorkingTree: false,
    commits,
    work,
  };
}

export function useCheckoutRailCatalog(
  source: CheckoutWorkSource | null,
  defaultBranchHint?: string | null,
) {
  const refetchInterval = useFocusedRefetchInterval(8_000);
  return useQuery({
    enabled: source != null,
    queryKey: ["checkout-rail-catalog", source, defaultBranchHint ?? null],
    queryFn: () =>
      source ? loadCheckoutRailCatalog(source, defaultBranchHint) : null,
    refetchInterval,
    retry: 1,
    staleTime: 2_000,
  });
}

export function useCheckoutSelectionDetail(
  source: CheckoutWorkSource | null,
  catalog: CheckoutRailCatalog | null | undefined,
  selectionId: string | null,
) {
  const selection =
    catalog?.selections.find((entry) => entry.id === selectionId) ?? null;
  // Main's history changes rarely; poll it slowly so the rail stays cheap.
  const isDefault =
    catalog != null &&
    selection != null &&
    isDefaultBranchSelection(selection, catalog);
  const fastInterval = useFocusedRefetchInterval(8_000);
  const slowInterval = useFocusedRefetchInterval(60_000);
  const refetchInterval = isDefault ? slowInterval : fastInterval;
  return useQuery({
    enabled: source != null && catalog != null && selectionId != null,
    queryKey: [
      "checkout-rail-selection",
      source,
      catalog?.primaryPath ?? null,
      catalog?.defaultBranch ?? null,
      selectionId,
    ],
    queryFn: () =>
      source && catalog && selectionId
        ? loadCheckoutSelectionDetail(source, catalog, selectionId)
        : null,
    refetchInterval,
    retry: 1,
    staleTime: isDefault ? 60_000 : 2_000,
  });
}
