import { hulaDirectoryPath } from "@/features/projects/lib/hulaProjectNames";

/** How many commits the chat rail reads. Older history stays in the commits tab. */
export const CHECKOUT_LOG_LIMIT = 8;

/** Cap so a huge dirty tree cannot paint thousands of rows. */
export const CHECKOUT_FILE_CAP = 200;

/**
 * Read-only. Branch line, untracked paths, and ignored files.
 * `--ignored` (traditional) is allowlisted on the OpenClaw gateway; the
 * `=matching` form is not. Directory rows (`!! build/`) are dropped in
 * parseIgnoredPaths so bulk folders do not inflate the dirty count.
 */
export const CHECKOUT_STATUS_ARGV = [
  "git",
  "status",
  "--porcelain=v1",
  "--branch",
  "--untracked-files=all",
  "--ignored",
] as const;

/** Same as CHECKOUT_STATUS_ARGV without ignored (gateway fallback). */
export const CHECKOUT_STATUS_ARGV_NO_IGNORED = [
  "git",
  "status",
  "--porcelain=v1",
  "--branch",
  "--untracked-files=all",
] as const;

/** Tracked changes against HEAD, staged and unstaged. Does not stage. */
export const CHECKOUT_NUMSTAT_ARGV = [
  "git",
  "diff",
  "--numstat",
  "HEAD",
] as const;

/** Read-only worktree inventory. Does not add or remove worktrees. */
export const CHECKOUT_WORKTREE_LIST_ARGV = [
  "git",
  "worktree",
  "list",
  "--porcelain",
] as const;

/** Local branch names only (`git branch --list`). Remotes are excluded. */
export const CHECKOUT_BRANCH_LIST_ARGV = [
  "git",
  "branch",
  "--list",
  "--format=%(refname:short)",
] as const;

/**
 * Newest commits on the checkout. Does not check out.
 * OpenClaw's git log allowlist accepts `-n`, `--pretty=medium`, and
 * `--no-color` (same flags as the Files tab) and rejects `--numstat`.
 * Per-commit line counts come from `git diff --numstat` instead.
 */
export function checkoutLogArgv(limit = CHECKOUT_LOG_LIMIT): string[] {
  const count = Number.isInteger(limit) && limit > 0 ? String(limit) : "8";
  return ["git", "log", "-n", count, "--pretty=medium", "--no-color", "HEAD"];
}

/** Empty trees. A root commit has no parent, so the diff starts here. */
const EMPTY_TREE_SHA1 = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const EMPTY_TREE_SHA256 =
  "6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321";

export const CHECKOUT_EMPTY_TREES = [
  EMPTY_TREE_SHA1,
  EMPTY_TREE_SHA256,
] as const;

const COMMIT_HASH = /^[0-9a-f]{7,64}$/;

/**
 * Per-commit line counts.
 * `git diff --numstat` is the working-tree command this checkout already runs.
 * The parent is `<hash>~1`, or an empty tree when that parent does not exist.
 * A value that is not a commit hash is refused so it cannot become a flag.
 */
export function checkoutCommitNumstatArgv(
  hash: string,
  parent?: string,
): string[] | null {
  if (!COMMIT_HASH.test(hash)) return null;
  const from = parent ?? `${hash}~1`;
  const parentOk =
    from === `${hash}~1` ||
    from === EMPTY_TREE_SHA1 ||
    from === EMPTY_TREE_SHA256;
  if (!parentOk) return null;
  return ["git", "diff", "--numstat", from, hash];
}

/** Attach one `git diff --numstat` result to a commit. Counts come only from that text. */
export function commitWithNumstat(
  commit: CheckoutCommitStat,
  numstat: string,
): CheckoutCommitStat {
  const files = parseGitNumstat(numstat);
  const totals = sumCheckoutFiles(files);
  return {
    ...commit,
    files,
    additions: totals.additions,
    deletions: totals.deletions,
  };
}

export type CheckoutFileStat = {
  path: string;
  /** Null when git has no line count (binary, untracked, or ignored). */
  additions: number | null;
  deletions: number | null;
  untracked?: boolean;
  ignored?: boolean;
};

export type CheckoutCommitStat = {
  hash: string;
  shortHash: string;
  subject: string;
  timestamp: number;
  additions: number;
  deletions: number;
  files: CheckoutFileStat[];
};

export type CheckoutWork = {
  root: string;
  branch: string | null;
  head: string | null;
  /** Commits ahead of the upstream tracking branch, when status reports it. */
  aheadCount: number | null;
  additions: number;
  deletions: number;
  files: CheckoutFileStat[];
  commits: CheckoutCommitStat[];
};

export type CheckoutWorkSource =
  | { kind: "hula"; root: string }
  | { kind: "local"; projectDtag: string; cloneUrl: string };

type CheckoutProject = {
  hulaPath?: string | null;
  repositories: readonly {
    hulaPath?: string | null;
    dtag: string;
    cloneUrls: readonly string[];
  }[];
};

type CheckoutRepository = CheckoutProject["repositories"][number];

function checkoutSourceFromRepository(
  repository: CheckoutRepository,
): CheckoutWorkSource | null {
  const root = repository.hulaPath
    ? hulaDirectoryPath(repository.hulaPath)
    : null;
  if (root) return { kind: "hula", root };
  const cloneUrl = repository.cloneUrls.find((url) => url.trim())?.trim();
  const projectDtag = repository.dtag.trim();
  if (cloneUrl && projectDtag) {
    return { kind: "local", projectDtag, cloneUrl };
  }
  return null;
}

/**
 * Checkout Buzz can already name.
 * An OpenClaw path wins over a cloned GitHub checkout.
 * No path means there is nothing to read.
 * A focus repository is the only checkout read. It does not fall through
 * to the primary repository or the project root.
 */
export function checkoutWorkSource(
  project: CheckoutProject,
  focus?: CheckoutRepository | null,
): CheckoutWorkSource | null {
  if (focus) return checkoutSourceFromRepository(focus);
  for (const repository of project.repositories) {
    const source = checkoutSourceFromRepository(repository);
    if (source?.kind === "hula") return source;
  }
  const projectRoot = project.hulaPath
    ? hulaDirectoryPath(project.hulaPath)
    : null;
  if (projectRoot) return { kind: "hula", root: projectRoot };
  const repository = project.repositories[0];
  return repository ? checkoutSourceFromRepository(repository) : null;
}

export function sumCheckoutFiles(files: readonly CheckoutFileStat[]): {
  additions: number;
  deletions: number;
  fileCount: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    if (file.additions != null) additions += file.additions;
    if (file.deletions != null) deletions += file.deletions;
  }
  return { additions, deletions, fileCount: files.length };
}

export function checkoutWorkFingerprint(work: CheckoutWork): string {
  const files = work.files
    .map((file) => {
      const mark = file.ignored ? "i" : file.untracked ? "u" : "";
      return `${file.path}\t${file.additions ?? ""}\t${file.deletions ?? ""}\t${mark}`;
    })
    .join("\n");
  return `${work.head ?? ""}\n${files}`;
}

/** Last row in the chat is a finished agent reply, and no agent is working. */
export function checkoutWorkCardMessageId(
  messages: readonly { id: string; isAgent: boolean; pending?: boolean }[],
  agentWorking: boolean,
): string | null {
  if (agentWorking || messages.length === 0) return null;
  const last = messages[messages.length - 1];
  if (!last?.isAgent || last.pending) return null;
  return last.id;
}

export type CheckoutWorkCardModel = {
  additions: number;
  deletions: number;
  fileCount: number;
  files: CheckoutFileStat[];
  commit: { hash: string; shortHash: string; subject: string } | null;
};

/**
 * Card body from the live checkout.
 * A commit link is included only when that hash is still HEAD.
 */
export function buildCheckoutWorkCard(
  work: CheckoutWork,
  linkedHead: string | null,
): CheckoutWorkCardModel | null {
  const linked =
    linkedHead && work.head === linkedHead
      ? (work.commits.find((commit) => commit.hash === linkedHead) ?? null)
      : null;
  if (work.files.length > 0) {
    const totals = sumCheckoutFiles(work.files);
    return {
      ...totals,
      files: work.files,
      commit: linked
        ? {
            hash: linked.hash,
            shortHash: linked.shortHash,
            subject: linked.subject,
          }
        : null,
    };
  }
  if (!linked || linked.files.length === 0) return null;
  const totals = sumCheckoutFiles(linked.files);
  return {
    ...totals,
    files: linked.files,
    commit: {
      hash: linked.hash,
      shortHash: linked.shortHash,
      subject: linked.subject,
    },
  };
}

function unquoteGitPath(path: string): string {
  if (path.length >= 2 && path.startsWith('"') && path.endsWith('"')) {
    return path.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  }
  return path;
}

function safeRepoPath(path: string): string | null {
  const normalized = unquoteGitPath(path)
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .trim();
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.split("/").includes("..")
  ) {
    return null;
  }
  return normalized;
}

function parseCount(value: string): number | null {
  if (value === "-") return null;
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
}

/** `git diff --numstat` rows. A binary file has null counts, not a fake zero. */
export function parseGitNumstat(stdout: string): CheckoutFileStat[] {
  const files: CheckoutFileStat[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    if (files.length >= CHECKOUT_FILE_CAP) break;
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const additions = parseCount(parts[0] ?? "");
    const deletions = parseCount(parts[1] ?? "");
    if (additions == null && parts[0] !== "-") continue;
    if (deletions == null && parts[1] !== "-") continue;
    const path = safeRepoPath(parts[parts.length - 1] ?? "");
    if (!path || seen.has(path)) continue;
    seen.add(path);
    files.push({ path, additions, deletions });
  }
  return files;
}

/**
 * Branch shown on a projects-index repository row.
 * A loaded checkout wins, including a detached HEAD (null), so a stored
 * default-branch tag cannot fill in. When checkout work is not loaded,
 * `statusBranch` is the name from the read-only status command.
 * Undefined status means that read has not finished. Null means it returned
 * no branch. Omit both cases rather than guessing.
 */
export function repositoryRowBranch(input: {
  checkoutWork?: { branch: string | null } | null;
  statusBranch?: string | null;
}): string | null {
  if (input.checkoutWork) {
    return input.checkoutWork.branch?.trim() || null;
  }
  if (input.statusBranch === undefined) return null;
  return input.statusBranch?.trim() || null;
}

/** Branch from `git status --porcelain=v1 --branch`. Detached HEAD is null. */
export function branchFromCheckoutStatus(stdout: string): string | null {
  const line = stdout.split(/\r?\n/).find((row) => row.startsWith("## "));
  if (!line) return null;
  const rest = line.slice(3).trim();
  if (!rest || rest.startsWith("HEAD (no branch)")) return null;
  const name = rest.split("...")[0]?.trim() ?? "";
  return name || null;
}

/** Ahead count from `## branch...upstream [ahead N]` when present. */
export function aheadCountFromCheckoutStatus(stdout: string): number | null {
  const line = stdout.split(/\r?\n/).find((row) => row.startsWith("## "));
  if (!line) return null;
  const match = /\bahead (\d+)\b/.exec(line);
  if (!match) return null;
  return Number(match[1]);
}

/** Untracked paths from porcelain. Directories stay as git printed them. */
export function parseUntrackedPaths(stdout: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    if (paths.length >= CHECKOUT_FILE_CAP) break;
    if (!line.startsWith("?? ")) continue;
    const path = safeRepoPath(line.slice(3));
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

/**
 * Ignored *file* paths from porcelain (`!! path`).
 * Directory entries (`!! build/`) are skipped so bulk ignore folders do not
 * flood the rail or mark every checkout dirty.
 */
export function parseIgnoredPaths(stdout: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    if (paths.length >= CHECKOUT_FILE_CAP) break;
    if (!line.startsWith("!! ")) continue;
    const raw = line.slice(3).trim();
    // Ignored directories stay out of the file list.
    if (raw.endsWith("/")) continue;
    const path = safeRepoPath(raw);
    if (!path || path.endsWith("/") || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

/** `git log --pretty=medium --numstat`. Newest records come first. */
export function parseGitMediumNumstat(stdout: string): CheckoutCommitStat[] {
  const commits: CheckoutCommitStat[] = [];
  let current: CheckoutCommitStat | null = null;
  let seenSubject = false;
  const flush = () => {
    if (!current?.hash || !current.subject) return;
    const totals = sumCheckoutFiles(current.files);
    current.additions = totals.additions;
    current.deletions = totals.deletions;
    commits.push(current);
  };
  for (const line of stdout.split(/\r?\n/)) {
    const commitHash = /^commit ([0-9a-f]{7,64})\b/.exec(line)?.[1];
    if (commitHash) {
      flush();
      current = {
        hash: commitHash,
        shortHash: commitHash.slice(0, 7),
        subject: "",
        timestamp: 0,
        additions: 0,
        deletions: 0,
        files: [],
      };
      seenSubject = false;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("Author:") || line.trim() === "") continue;
    if (line.startsWith("Date:")) {
      const parsed = Date.parse(line.replace(/^Date:\s+/, ""));
      current.timestamp = Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
      continue;
    }
    if (line.startsWith("    ") || line.startsWith("\t")) {
      if (!seenSubject) {
        current.subject = line.replace(/^(?: {4}|\t)/, "").trim();
        seenSubject = current.subject.length > 0;
      }
      continue;
    }
    if (!seenSubject || current.files.length >= CHECKOUT_FILE_CAP) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const additions = parseCount(parts[0] ?? "");
    const deletions = parseCount(parts[1] ?? "");
    if (additions == null && parts[0] !== "-") continue;
    if (deletions == null && parts[1] !== "-") continue;
    const path = safeRepoPath(parts[parts.length - 1] ?? "");
    if (!path) continue;
    current.files.push({ path, additions, deletions });
  }
  flush();
  return commits;
}

/**
 * Join one status, one `git diff --numstat HEAD`, and one numstat log.
 * Counts come only from those commands.
 */
export function parseCheckoutWork(
  root: string,
  status: string,
  numstat: string,
  log: string,
): CheckoutWork {
  const tracked = parseGitNumstat(numstat);
  const seen = new Set(tracked.map((file) => file.path));
  const files = [...tracked];
  for (const path of parseUntrackedPaths(status)) {
    if (files.length >= CHECKOUT_FILE_CAP) break;
    if (seen.has(path)) continue;
    seen.add(path);
    files.push({
      path,
      additions: null,
      deletions: null,
      untracked: true,
    });
  }
  for (const path of parseIgnoredPaths(status)) {
    if (files.length >= CHECKOUT_FILE_CAP) break;
    if (seen.has(path)) continue;
    seen.add(path);
    files.push({
      path,
      additions: null,
      deletions: null,
      ignored: true,
    });
  }
  const commits = parseGitMediumNumstat(log);
  const totals = sumCheckoutFiles(files);
  return {
    root,
    branch: branchFromCheckoutStatus(status),
    head: commits[0]?.hash ?? null,
    aheadCount: aheadCountFromCheckoutStatus(status),
    additions: totals.additions,
    deletions: totals.deletions,
    files,
    commits,
  };
}

/** Directory name used as a worktree row label. */

/**
 * True when the final path segment looks like a file (e.g. research-test.md).
 * Worktree paths must be directories — never invent a worktree from a filename.
 */
export function isFileLikePathSegment(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  const last = normalized.split("/").filter(Boolean).pop() ?? "";
  return last.includes(".") && /\.[A-Za-z0-9]+$/.test(last);
}

export function checkoutWorktreeLabel(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

function safeGitName(name: string): string | null {
  const value = name.trim();
  if (
    !value ||
    value.startsWith("-") ||
    value.includes("..") ||
    value.includes(" ") ||
    value.includes("\0")
  ) {
    return null;
  }
  return value;
}

/**
 * Commits on HEAD that are not reachable from the default branch.
 * `git rev-list --count <default>..HEAD` with a validated default name.
 */
export function checkoutUniqueCommitCountArgv(
  defaultBranch: string,
): string[] | null {
  const name = safeGitName(defaultBranch);
  if (!name) return null;
  return ["git", "rev-list", "--count", `${name}..HEAD`];
}

/** Commits on one named branch that are not on the default branch. */
export function checkoutBranchUniqueCountArgv(
  defaultBranch: string,
  branch: string,
): string[] | null {
  const base = safeGitName(defaultBranch);
  const head = safeGitName(branch);
  if (!base || !head) return null;
  return ["git", "rev-list", "--count", `${base}..${head}`];
}

/**
 * Recent commits unique to one ref vs the default branch.
 * Same pretty format as the checkout log; range is `<default>..<ref>`.
 */
export function checkoutUniqueLogArgv(
  defaultBranch: string,
  ref: string,
  limit = CHECKOUT_LOG_LIMIT,
): string[] | null {
  const base = safeGitName(defaultBranch);
  const head = safeGitName(ref);
  if (!base || !head) return null;
  const count = Number.isInteger(limit) && limit > 0 ? String(limit) : "8";
  return [
    "git",
    "log",
    "-n",
    count,
    "--pretty=medium",
    "--no-color",
    `${base}..${head}`,
  ];
}

/** How many commits the default-branch row lists. */
export const CHECKOUT_DEFAULT_HISTORY_LIMIT = 30;

/**
 * Recent history of one ref (no range): `git log -n <limit> <ref>`.
 * Same pretty format as {@link checkoutUniqueLogArgv}.
 */
export function checkoutRefLogArgv(
  ref: string,
  limit = CHECKOUT_DEFAULT_HISTORY_LIMIT,
): string[] | null {
  const name = safeGitName(ref);
  if (!name) return null;
  const count =
    Number.isInteger(limit) && limit > 0
      ? String(limit)
      : String(CHECKOUT_DEFAULT_HISTORY_LIMIT);
  return ["git", "log", "-n", count, "--pretty=medium", "--no-color", name];
}

/** `gh pr list` for one branch head. Branch must already be a safe ref name. */
export function checkoutOpenPrListArgv(branch: string): string[] | null {
  const name = safeGitName(branch);
  if (!name) return null;
  return [
    "gh",
    "pr",
    "list",
    "--head",
    name,
    "--state",
    "open",
    "--json",
    "number",
    "--limit",
    "1",
  ];
}

export function parseRevListCount(stdout: string): number {
  const line = stdout.trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (!/^\d+$/.test(line)) return 0;
  return Number(line);
}

/** First open PR number from `gh pr list --json number`. */
export function parseOpenPrNumber(stdout: string): number | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const first = parsed[0];
    if (
      first &&
      typeof first === "object" &&
      "number" in first &&
      typeof (first as { number: unknown }).number === "number"
    ) {
      return (first as { number: number }).number;
    }
  } catch {
    return null;
  }
  return null;
}

export type CheckoutPullRequest = {
  number: number;
  title: string;
  state: "open" | "draft" | "merged" | "closed";
  url: string;
  headRefName: string;
  baseRefName: string;
};

function mapPullRequestState(
  state: string,
  isDraft: boolean,
): CheckoutPullRequest["state"] | null {
  const normalized = state.trim().toUpperCase();
  if (normalized === "MERGED") return "merged";
  if (normalized === "CLOSED") return "closed";
  if (normalized === "OPEN") return isDraft ? "draft" : "open";
  return null;
}

/** Strip an optional `owner:` prefix from a head ref (`fork:branch` → `branch`). */
function stripOwnerPrefix(ref: string): string {
  const trimmed = ref.trim();
  const colon = trimmed.indexOf(":");
  if (colon <= 0) return trimmed;
  return trimmed.slice(colon + 1);
}

/** Parse `gh pr list --json ...` stdout into checkout PR records. */
export function parsePullRequests(json: string): CheckoutPullRequest[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: CheckoutPullRequest[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const number = row.number;
    const title = row.title;
    const stateRaw = row.state;
    const url = row.url;
    const headRefName = row.headRefName;
    const baseRefName = row.baseRefName;
    const isDraft = row.isDraft === true;
    if (typeof number !== "number" || !Number.isFinite(number)) continue;
    if (typeof title !== "string") continue;
    if (typeof stateRaw !== "string") continue;
    if (typeof url !== "string") continue;
    if (typeof headRefName !== "string") continue;
    if (typeof baseRefName !== "string") continue;
    const state = mapPullRequestState(stateRaw, isDraft);
    if (!state) continue;
    out.push({
      number,
      title,
      state,
      url,
      headRefName,
      baseRefName,
    });
  }
  return out;
}

/** PRs whose head matches `branch` exactly, or after stripping `owner:`. */
export function pullRequestsForBranch(
  prs: readonly CheckoutPullRequest[],
  branch: string,
): CheckoutPullRequest[] {
  const wanted = branch.trim();
  if (!wanted) return [];
  const wantedKey = stripOwnerPrefix(wanted);
  return prs.filter((pr) => {
    const head = pr.headRefName.trim();
    if (!head) return false;
    if (head === wanted) return true;
    return stripOwnerPrefix(head) === wantedKey;
  });
}

/** PRs whose base matches `base` exactly, or after stripping `owner:`. */
export function pullRequestsForBase(
  prs: readonly CheckoutPullRequest[],
  base: string,
): CheckoutPullRequest[] {
  const wanted = base.trim();
  if (!wanted) return [];
  const wantedKey = stripOwnerPrefix(wanted);
  return prs.filter((pr) => {
    const baseRef = pr.baseRefName.trim();
    if (!baseRef) return false;
    if (baseRef === wanted) return true;
    return stripOwnerPrefix(baseRef) === wantedKey;
  });
}

/**
 * True when the branch has at least one merged PR and no open/draft PR.
 * Closed-only branches stay false.
 */
export function isBranchMerged(
  prs: readonly CheckoutPullRequest[],
  branch: string,
): boolean {
  const matched = pullRequestsForBranch(prs, branch);
  if (matched.length === 0) return false;
  const hasMerged = matched.some((pr) => pr.state === "merged");
  const hasActive = matched.some(
    (pr) => pr.state === "open" || pr.state === "draft",
  );
  return hasMerged && !hasActive;
}

/** Local branch names from `git branch --list --format=%(refname:short)`. */
export function parseLocalBranchList(stdout: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const name = line.trim();
    if (!name || seen.has(name) || !safeGitName(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export const CHECKOUT_RAIL_SECTIONS = [
  { id: "branches", label: "Branches" },
  { id: "worktrees", label: "Worktrees" },
  { id: "stale-branches", label: "Stale branches" },
  { id: "stale-worktrees", label: "Stale worktrees" },
] as const;

export type CheckoutRailSectionId =
  (typeof CHECKOUT_RAIL_SECTIONS)[number]["id"];

export type CheckoutSelectionKind = "branch" | "worktree" | "checkout";

export type CheckoutRailSelection = {
  id: string;
  kind: CheckoutSelectionKind;
  label: string;
  section: CheckoutRailSectionId;
  stale: boolean;
  /** Working-tree path when this selection is checked out somewhere. */
  checkoutPath: string | null;
  branch: string | null;
  uniqueCommitCount: number;
  dirtyFileCount: number;
};

export type CheckoutRailCatalog = {
  primaryPath: string;
  primaryDisplayPath: string;
  /** Branch (or detached label) checked out in the primary path. */
  currentName: string;
  defaultBranch: string;
  selections: CheckoutRailSelection[];
};

export type CheckoutSelectionDetail = {
  files: CheckoutFileStat[];
  /** True when a branch is selected but not checked out anywhere. */
  noWorkingTree: boolean;
  commits: CheckoutCommitStat[];
  work: CheckoutWork | null;
};

export function checkoutSelectionId(
  kind: CheckoutSelectionKind,
  key: string,
): string {
  return `${kind}:${key}`;
}

export function isCheckoutSelectionStale(input: {
  uniqueCommitCount: number;
  dirtyFileCount: number;
  prunable?: boolean;
  branchGone?: boolean;
}): boolean {
  if (input.prunable || input.branchGone) return true;
  return input.uniqueCommitCount === 0 && input.dirtyFileCount === 0;
}

function selectionOpenRank(selection: CheckoutRailSelection): number {
  if (selection.stale) return 3;
  if (selection.dirtyFileCount > 0) return 0;
  if (selection.uniqueCommitCount > 0) return 1;
  return 2;
}

/**
 * Default dropdown selection.
 * Prefer open work (dirty files or commits past the default branch) over
 * stale entries. Prefer the primary's current branch when it has open work.
 */
export function pickDefaultCheckoutSelection(
  catalog: CheckoutRailCatalog,
): string | null {
  const options = catalog.selections;
  if (options.length === 0) return null;
  const open = options.filter((option) => selectionOpenRank(option) <= 1);
  const pool = open.length > 0 ? open : options;
  const primaryCheckoutId = checkoutSelectionId(
    "checkout",
    catalog.primaryPath,
  );
  const primaryOpen =
    open.find((option) => option.id === primaryCheckoutId) ??
    open.find(
      (option) =>
        option.kind === "checkout" ||
        (option.kind === "worktree" && option.branch === catalog.currentName),
    );
  if (primaryOpen) return primaryOpen.id;
  let best = pool[0];
  if (!best) return null;
  for (const option of pool.slice(1)) {
    const bestRank = selectionOpenRank(best);
    const optionRank = selectionOpenRank(option);
    if (optionRank < bestRank) {
      best = option;
      continue;
    }
    if (optionRank > bestRank) continue;
    if (option.uniqueCommitCount > best.uniqueCommitCount) {
      best = option;
    }
  }
  return best.id;
}

/**
 * Chips for the selection header under the Branches/Worktrees dropdown.
 * Primary → "Checkout"; linked worktrees → "worktree".
 * Default branch named main → chip "main" (not generic "branch"); other
 * default-branch names (e.g. master) use that name as the chip.
 * Other branches → "branch".
 * "Current" on the primary checkout row, or a branch matching primary HEAD.
 * Linked worktrees never get Current.
 */
export function checkoutSelectionChips(
  selection: CheckoutRailSelection,
  catalog: Pick<
    CheckoutRailCatalog,
    "primaryPath" | "currentName" | "defaultBranch"
  >,
  options?: { merged?: boolean },
): string[] {
  const chips: string[] = [];
  if (selection.kind === "checkout") {
    chips.push("Checkout");
  } else if (selection.kind === "worktree") {
    chips.push("worktree");
  } else if (selection.branch === "main") {
    // Product label for the main line — literal "main", not "branch".
    chips.push("main");
  } else if (selection.branch && selection.branch === catalog.defaultBranch) {
    chips.push(selection.branch);
  } else {
    chips.push("branch");
  }

  const isPrimaryCheckout = selection.kind === "checkout";
  const isCurrentBranch =
    selection.kind === "branch" &&
    Boolean(selection.branch) &&
    selection.branch === catalog.currentName;
  if (isPrimaryCheckout || isCurrentBranch) {
    chips.push("Current");
  }

  // Merged replaces stale: a merged branch is done, not abandoned.
  if (options?.merged) chips.push("merged");
  else if (selection.stale) chips.push("stale");
  return chips;
}

/**
 * Top of the dropdown: default branch (main), then the Checkout row.
 * These are pinned above the Branches/Worktrees section headers.
 */
export function checkoutRailLeadingOptions(
  selections: readonly CheckoutRailSelection[],
  defaultBranch: string,
): CheckoutRailSelection[] {
  const leading: CheckoutRailSelection[] = [];
  const defaultRow = selections.find(
    (option) => option.kind === "branch" && option.branch === defaultBranch,
  );
  if (defaultRow) leading.push(defaultRow);
  for (const option of selections) {
    if (option.kind === "checkout") leading.push(option);
  }
  return leading;
}

/** Group remaining selections into labeled sections; empty ones are omitted. */
export function checkoutRailSections(
  selections: readonly CheckoutRailSelection[],
  defaultBranch?: string,
): Array<{
  id: CheckoutRailSectionId;
  label: string;
  options: CheckoutRailSelection[];
}> {
  return CHECKOUT_RAIL_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    options: selections.filter((option) => {
      if (option.kind === "checkout") return false;
      if (
        defaultBranch &&
        option.kind === "branch" &&
        option.branch === defaultBranch
      ) {
        return false;
      }
      return option.section === section.id;
    }),
  })).filter((section) => section.options.length > 0);
}

/** @deprecated Prefer {@link checkoutRailLeadingOptions}. */
export function checkoutRailCheckoutOptions(
  selections: readonly CheckoutRailSelection[],
): CheckoutRailSelection[] {
  return selections.filter((option) => option.kind === "checkout");
}

/** Where a rail file row should open (worktree disk or git blob at ref). */
/**
 * Browse target for the rail's single Files row.
 * Opens the full tree for this selection (worktree cwd at HEAD, or branch ref).
 */
export type CheckoutFilesBrowseTarget = {
  root: string;
  gitRef: string;
  /** Rail selection this tree was opened for (shown atop the Files sheet). */
  context?: CheckoutFilesContext;
};

/** Header strip on the Files sheet: which branch or worktree it shows. */
export type CheckoutFilesContext = {
  kind: CheckoutSelectionKind;
  /** Branch name, or the worktree directory name. */
  label: string;
  /** Worktree branch, shown faintly after the label. Null otherwise. */
  branch: string | null;
  /** Same chips the rail selection header shows. */
  chips: string[];
  /** Working tree on disk. Null when the tree is read from git only. */
  path: string | null;
};

/**
 * Where the Files row should open the tree.
 * Checkout/worktree → that path at HEAD. Unchecked-out branch → primary at branch.
 */
export function resolveCheckoutFilesBrowseTarget(
  selection: CheckoutRailSelection,
  catalog: Pick<CheckoutRailCatalog, "primaryPath">,
): CheckoutFilesBrowseTarget | null {
  // Branch rows (including main) always open that ref — not checkout HEAD.
  if (selection.kind === "branch") {
    const branch = selection.branch?.trim();
    if (!branch) return null;
    return { root: catalog.primaryPath, gitRef: branch };
  }
  const root = selection.checkoutPath ?? catalog.primaryPath;
  if (!root) return null;
  return { root, gitRef: "HEAD" };
}

/** Files-sheet header for one rail selection. */
export function checkoutFilesContext(
  selection: CheckoutRailSelection,
  catalog: Pick<
    CheckoutRailCatalog,
    "primaryPath" | "currentName" | "defaultBranch"
  >,
  options?: { merged?: boolean },
): CheckoutFilesContext {
  const chips = checkoutSelectionChips(selection, catalog, options);
  const branch = selection.branch?.trim() || null;
  if (selection.kind === "worktree") {
    return {
      kind: "worktree",
      label: selection.label,
      branch,
      chips,
      path: selection.checkoutPath,
    };
  }
  if (selection.kind === "checkout") {
    return {
      kind: "checkout",
      label: branch ?? catalog.currentName ?? selection.label,
      branch: null,
      chips,
      path: selection.checkoutPath ?? catalog.primaryPath,
    };
  }
  return {
    kind: "branch",
    label: branch ?? selection.label,
    branch: null,
    chips,
    path: selection.checkoutPath,
  };
}

function sameCheckoutPath(a: string, b: string): boolean {
  const norm = (path: string) =>
    path.trim().replaceAll("\\", "/").replace(/\/+$/, "");
  return norm(a) === norm(b);
}

/**
 * Files-sheet header for a tree opened without a rail selection
 * (e.g. the top Files tab). Matches what is displayed (root + ref) against
 * the rail catalog. Null when nothing in the catalog matches.
 */
export function resolveCheckoutFilesContext(
  target: { root?: string | null; gitRef?: string | null },
  catalog: CheckoutRailCatalog | null,
  options?: {
    merged?: boolean;
    pullRequests?: readonly CheckoutPullRequest[];
  },
): CheckoutFilesContext | null {
  const root = target.root?.trim();
  if (!catalog || !root) return null;
  const ref = target.gitRef?.trim() || "HEAD";
  const match =
    ref === "HEAD"
      ? catalog.selections.find(
          (entry) =>
            (entry.kind === "checkout" || entry.kind === "worktree") &&
            entry.checkoutPath != null &&
            sameCheckoutPath(entry.checkoutPath, root),
        )
      : sameCheckoutPath(root, catalog.primaryPath)
        ? catalog.selections.find(
            (entry) => entry.kind === "branch" && entry.branch === ref,
          )
        : undefined;
  if (!match) return null;
  const merged =
    options?.merged ??
    (match.branch && options?.pullRequests
      ? isBranchMerged(options.pullRequests, match.branch)
      : false);
  return checkoutFilesContext(match, catalog, { merged });
}

/** True for the default-branch row (e.g. "main") of the Branches list. */
export function isDefaultBranchSelection(
  selection: Pick<CheckoutRailSelection, "kind" | "branch">,
  catalog: Pick<CheckoutRailCatalog, "defaultBranch">,
): boolean {
  return (
    selection.kind === "branch" &&
    Boolean(selection.branch) &&
    selection.branch === catalog.defaultBranch
  );
}

export type CheckoutAgentPromptInput = {
  /** "main" is the default-branch row; the rest match selection kinds. */
  kind: "main" | CheckoutSelectionKind;
  branch: string | null;
  /** Working-tree path for checkout/worktree selections, else null. */
  path: string | null;
  /** Primary checkout path. */
  primaryPath: string;
  /** Project display path (`Hula/...`). */
  hulaPath: string;
  defaultBranch: string;
};

/** Short plain-text brief telling an agent where (and how) to work. */
export function checkoutAgentPrompt(input: CheckoutAgentPromptInput): string {
  const base = input.defaultBranch.trim() || "main";
  const branch = input.branch?.trim() || "";
  const primary = input.primaryPath.trim() || input.hulaPath.trim();
  const lines = [
    `You are working on the Hula project at ${input.hulaPath.trim() || primary}.`,
  ];
  const finish =
    "Make and commit changes only there, and follow the Hula skills in the OpenClaw workspace for commits, pushes, and the pull request.";
  if (input.kind === "main") {
    lines.push(
      `Start from ${base} at ${primary} and create your branch the way the Hula skills describe; do not commit directly to ${base}.`,
    );
    return lines.join("\n");
  }
  if (input.kind === "branch" || !input.path) {
    const name = branch || "(unknown)";
    lines.push(
      `Branch ${name} (base: ${base}) is not checked out. From ${primary}, check it out or create a worktree for it as the Hula skills describe before working.`,
    );
    return lines.join("\n");
  }
  const where = input.kind === "worktree" ? "worktree" : "checkout";
  const onBranch = branch ? ` on branch ${branch}` : " (detached HEAD)";
  lines.push(
    `Work only in the ${where} at ${input.path.trim()}${onBranch} (base: ${base}).`,
    finish,
  );
  return lines.join("\n");
}
