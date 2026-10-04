import { hulaDirectoryPath } from "@/features/projects/lib/hulaProjectNames";

/** How many commits the chat rail reads. Older history stays in the commits tab. */
export const CHECKOUT_LOG_LIMIT = 8;

/** Cap so a huge dirty tree cannot paint thousands of rows. */
export const CHECKOUT_FILE_CAP = 200;

/** Read-only. Includes the branch line and untracked paths. Does not stage. */
export const CHECKOUT_STATUS_ARGV = [
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
  /** Null when git has no line count (binary or untracked). */
  additions: number | null;
  deletions: number | null;
  untracked?: boolean;
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
    .map(
      (file) =>
        `${file.path}\t${file.additions ?? ""}\t${file.deletions ?? ""}`,
    )
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
  const commits = parseGitMediumNumstat(log);
  const totals = sumCheckoutFiles(files);
  return {
    root,
    branch: branchFromCheckoutStatus(status),
    head: commits[0]?.hash ?? null,
    additions: totals.additions,
    deletions: totals.deletions,
    files,
    commits,
  };
}
