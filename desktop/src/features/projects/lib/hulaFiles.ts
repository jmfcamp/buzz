import { hulaDirectoryPath } from "@/features/projects/lib/hulaProjectNames";
import {
  openClawToolJson,
  openClawToolText,
} from "@/features/projects/lib/openClawToolResult";
import type {
  ProjectRepoCommit,
  ProjectRepoContributor,
  ProjectRepoDiff,
  ProjectRepoFile,
  ProjectRepoFileGitStatus,
  ProjectRepoSnapshot,
} from "@/shared/api/projectGitTypes";

/** One OpenClaw directory entry shown in the Files tab. */
export type HulaFileEntry = {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink" | "other";
  size: number | null;
  children?: HulaFileEntry[];
};

/** How far a worktree walk goes for disk file lists and sizes. */
const HULA_SIZE_WALK_DEPTH = 32;

/**
 * The contributor list keeps the people with the most commits.
 * The commit list itself is the full history of the ref.
 */
const HULA_CONTRIBUTOR_LIMIT = 50;

/**
 * OpenClaw stops one command at this many stdout bytes.
 * A history that fills the cap is the newest history that fit, not the whole ref.
 */
export const HULA_GIT_OUTPUT_CAP = 2_000_000;

/** Buzz skips a preview above this size. The file header still keeps the size. */
const HULA_PREVIEW_BYTES = 64 * 1024;

/** Buzz keeps this many changed files, and this many patch lines per file. */
const HULA_DIFF_FILE_LIMIT = 250;
const HULA_PATCH_LINE_LIMIT = 2_000;

/**
 * Empty tree hashes. `git diff` against one lists every file at the ref.
 * SHA-1 first. A SHA-256 repo rejects that object, then the loader tries the other.
 */
const EMPTY_TREE_SHA1 = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const EMPTY_TREE_SHA256 =
  "6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321";

const SAFE_GIT_REF = /^[A-Za-z0-9._/\-@{}~^]+$/;

/**
 * History of one ref, with the paths each commit still has.
 * Newest commit wins for each path. This does not change the checkout.
 */
export function hulaCommitLogArgv(ref: string): string[] {
  return ["git", "log", "--pretty=medium", "--name-status", "--no-color", ref];
}

/**
 * Commit list for one ref, without per-file names.
 * File names fill the output cap and would hide older commits.
 * This does not change the checkout.
 */
export function hulaCommitListArgv(ref: string): string[] {
  return ["git", "log", "--pretty=medium", "--no-color", ref];
}

/**
 * Every commit reachable from a local ref.
 * `--all` is an allowlisted `git log` flag. This does not change the checkout.
 */
export function hulaAllCommitsArgv(): string[] {
  return ["git", "log", "--pretty=medium", "--no-color", "--all"];
}

/** True when a git read filled the OpenClaw output cap. */
export function hulaGitOutputWasCut(
  stdout: string,
  truncated?: boolean,
): boolean {
  if (truncated) return true;
  return new TextEncoder().encode(stdout).byteLength >= HULA_GIT_OUTPUT_CAP;
}

/** Tracked paths at `ref`, the same set `git ls-tree -r` would name. */
export function hulaTrackedTreeArgv(ref: string, emptyTree: string): string[] {
  return ["git", "diff", "--name-only", "--no-color", emptyTree, ref];
}

/** One commit, for the page opened from the file table. */
export function hulaOneCommitArgv(ref: string): string[] {
  return ["git", "log", "-n", "1", "--pretty=medium", "--no-color", ref];
}

/**
 * Patch from the parent commit to `ref`.
 * The flags match the Buzz commit diff that this gateway allows.
 * Git still uses the `a/` and `b/` prefixes. This does not change the checkout.
 */
export function hulaCommitDiffArgv(parent: string, ref: string): string[] {
  return [
    "git",
    "diff",
    "--no-color",
    "--find-renames",
    "--find-copies",
    "--unified=80",
    parent,
    ref,
  ];
}

/**
 * Three-dot diff of a review.
 * Each side is checked on its own. One string that contains `..` is refused,
 * so the range is joined after both sides pass.
 * This does not change the checkout.
 */
export function hulaReviewDiffArgv(base: string, head: string): string[] {
  return [
    "git",
    "diff",
    "--no-color",
    "--find-renames",
    "--find-copies",
    "--unified=80",
    `${hulaGitRef(base)}...${hulaGitRef(head)}`,
  ];
}

/** Two-dot diff used when the three-dot merge base cannot be read. */
export function hulaTwoDotDiffArgv(base: string, head: string): string[] {
  return [
    "git",
    "diff",
    "--no-color",
    "--find-renames",
    "--find-copies",
    "--unified=80",
    hulaGitRef(base),
    hulaGitRef(head),
  ];
}

/** Dirty tracked paths. A clean worktree size matches the committed blob. */
export const HULA_STATUS_ARGV = [
  "git",
  "status",
  "--porcelain",
  "--untracked-files=no",
] as const;

/**
 * Worktree status used when Files lists disk paths at HEAD.
 * Includes untracked and ignored paths so ignored files can be classified.
 */
export const HULA_WORKTREE_STATUS_ARGV = [
  "git",
  "status",
  "--porcelain",
  "--untracked-files=all",
  "--ignored",
] as const;

const ENTRY_TYPES = new Set<HulaFileEntry["type"]>([
  "file",
  "directory",
  "symlink",
  "other",
]);

type DirectoryCall = (
  name: "list_directory",
  arguments_: Record<string, unknown>,
) => Promise<{ isError: boolean; result: unknown }>;

/**
 * Directory the Files tab lists.
 * The project directory is the root. A selected codebase replaces it.
 */
export function hulaFilesRootPath(
  projectPath: string | null | undefined,
  repositoryPath: string | null | undefined,
): string | null {
  const project = projectPath ? hulaDirectoryPath(projectPath) : null;
  if (!project) return null;
  const repository = repositoryPath ? hulaDirectoryPath(repositoryPath) : null;
  return repository ?? project;
}

/** Keep a path inside the file root. `..` and outside paths are refused. */
export function hulaFilesInsideRoot(
  root: string,
  candidate: string,
): string | null {
  const normalizedRoot = hulaDirectoryPath(root);
  const normalized = hulaDirectoryPath(candidate);
  if (!normalizedRoot || !normalized) return null;
  if (
    normalized === normalizedRoot ||
    normalized.startsWith(`${normalizedRoot}/`)
  ) {
    return normalized;
  }
  return null;
}

/** Folder names below the file root. Empty when `current` is the root. */
export function hulaFilesBreadcrumb(root: string, current: string): string[] {
  const normalizedRoot = hulaDirectoryPath(root);
  const inside = hulaFilesInsideRoot(root, current);
  if (!normalizedRoot || !inside || inside === normalizedRoot) return [];
  return inside.slice(normalizedRoot.length + 1).split("/");
}

/** Resolve a breadcrumb prefix. A segment that leaves the root is refused. */
export function hulaFilesDirectoryAt(
  root: string,
  segments: readonly string[],
): string | null {
  const normalizedRoot = hulaDirectoryPath(root);
  if (!normalizedRoot) return null;
  if (segments.length === 0) return normalizedRoot;
  return hulaFilesInsideRoot(root, `${normalizedRoot}/${segments.join("/")}`);
}

/** OpenClaw path for one path from the file table. */
export function hulaOpenFilePath(
  root: string,
  relativePath: string,
): string | null {
  const normalizedRoot = hulaDirectoryPath(root);
  if (!normalizedRoot || !relativePath || relativePath.startsWith("/")) {
    return null;
  }
  return hulaFilesInsideRoot(
    normalizedRoot,
    `${normalizedRoot}/${relativePath}`,
  );
}

/** Parent folder inside the file root, or null at the root. */
export function hulaFilesParent(root: string, current: string): string | null {
  const crumbs = hulaFilesBreadcrumb(root, current);
  if (crumbs.length === 0) return null;
  return hulaFilesDirectoryAt(root, crumbs.slice(0, -1));
}

/**
 * Path opened from one listed entry.
 * The tool path must be exactly the current folder plus the entry name.
 */
export function hulaFilesEntryPath(
  root: string,
  current: string,
  entry: { name: string; path: string },
): string | null {
  if (!singleSegment(entry.name)) return null;
  const folder = hulaFilesInsideRoot(root, current);
  if (!folder) return null;
  const expected = hulaDirectoryPath(`${folder}/${entry.name}`);
  const listed = hulaDirectoryPath(entry.path);
  if (!expected || listed !== expected) return null;
  return expected;
}

/** Entries from one `list_directory` payload. Unsafe names are dropped. */
export function hulaDirectoryEntries(json: unknown): HulaFileEntry[] {
  const raw =
    json && typeof json === "object" && "entries" in json
      ? (json as { entries?: unknown }).entries
      : null;
  return readEntries(raw);
}

/**
 * Files under `root`, with paths relative to that directory.
 * Folders stay out of the list. The file table builds them from these paths.
 */
export function hulaRelativeFiles(
  root: string,
  entries: readonly HulaFileEntry[],
): { path: string; size: number | null }[] {
  const normalizedRoot = hulaDirectoryPath(root);
  if (!normalizedRoot) return [];
  const files: { path: string; size: number | null }[] = [];
  const seen = new Set<string>();
  const walk = (
    current: string,
    items: readonly HulaFileEntry[] | undefined,
  ) => {
    for (const entry of items ?? []) {
      const full = hulaFilesEntryPath(normalizedRoot, current, entry);
      if (!full) continue;
      if (entry.type === "directory") {
        walk(full, entry.children);
        continue;
      }
      const relative = full.slice(normalizedRoot.length + 1);
      if (!relative || seen.has(relative)) continue;
      seen.add(relative);
      files.push({ path: relative, size: entry.size });
    }
  };
  walk(normalizedRoot, entries);
  return files;
}

type HulaLogCommit = ProjectRepoCommit & { body: string; files: string[] };

/**
 * Ref the Files snapshot reads. `HEAD` is the OpenClaw checkout.
 * A branch name must pass the same checks the gateway uses.
 */
export function hulaGitRef(ref: string | null | undefined): string {
  const value = ref?.trim() || "HEAD";
  if (
    value === "HEAD" ||
    (value.length <= 256 &&
      !value.startsWith("-") &&
      !value.startsWith("/") &&
      !value.startsWith("~") &&
      !value.includes(" ") &&
      !value.includes("..") &&
      !/\.[A-Za-z0-9]+$/.test(value) &&
      SAFE_GIT_REF.test(value))
  ) {
    return value;
  }
  throw new Error("That branch cannot be read.");
}

/** Repo-relative path that `git show <ref>:<path>` may read. */
export function hulaSafeRepoPath(path: string): boolean {
  if (
    !path ||
    path.startsWith("-") ||
    path.startsWith("/") ||
    path.startsWith("~") ||
    path.includes("\0") ||
    path.includes("\n") ||
    path.includes("\\") ||
    path.includes("://")
  ) {
    return false;
  }
  return path
    .split("/")
    .every((part) => part !== "" && part !== "." && part !== "..");
}

/**
 * Allowlisted `git show` for one committed blob.
 * The gateway forces `--no-textconv`. This does not change the checkout.
 */
export function hulaShowFileArgv(
  ref: string,
  relativePath: string,
): string[] | null {
  let safeRef: string;
  try {
    safeRef = hulaGitRef(ref);
  } catch {
    return null;
  }
  if (!hulaSafeRepoPath(relativePath)) return null;
  return ["git", "show", `${safeRef}:${relativePath}`];
}

/**
 * Text of one committed blob.
 * Binary files and files over 64 KiB stay metadata-only, as Buzz does.
 */
export function hulaBlobText(stdout: string): string | null {
  if (stdout.includes("\0")) return null;
  if (new TextEncoder().encode(stdout).byteLength > HULA_PREVIEW_BYTES) {
    return null;
  }
  return stdout;
}

/** Commit on a Hula snapshot, including a file's own last commit. */
export function hulaCommitByHash(
  snapshot: ProjectRepoSnapshot | null | undefined,
  hash: string | null,
): ProjectRepoCommit | null {
  if (!snapshot || !hash) return null;
  return (
    snapshot.commits.find((commit) => commit.hash === hash) ??
    (snapshot.latestCommit?.hash === hash ? snapshot.latestCommit : null) ??
    snapshot.files.find((file) => file.latestCommit?.hash === hash)
      ?.latestCommit ??
    null
  );
}

/** Parse `git log --pretty=medium --name-status`. Newest records come first. */
export function parseGitMediumNameLog(stdout: string): HulaLogCommit[] {
  const commits: HulaLogCommit[] = [];
  let current: HulaLogCommit | null = null;
  let seenSubject = false;
  let bodyLines: string[] = [];
  let bodyStarted = false;
  let pendingBlank = false;
  const flush = () => {
    if (!current?.hash || !current.subject) return;
    current.body = bodyLines.join("\n").trim();
    commits.push(current);
  };
  for (const line of stdout.split(/\r?\n/)) {
    const commitHash = /^commit ([0-9a-f]{7,64})\b/.exec(line)?.[1];
    if (commitHash) {
      flush();
      current = {
        hash: commitHash,
        shortHash: commitHash.slice(0, 7),
        authorName: "",
        authorEmail: "",
        timestamp: 0,
        subject: "",
        body: "",
        files: [],
      };
      seenSubject = false;
      bodyLines = [];
      bodyStarted = false;
      pendingBlank = false;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("Author:")) {
      const author = parseAuthor(line);
      current.authorName = author.name;
      current.authorEmail = author.email;
      continue;
    }
    if (line.startsWith("Date:")) {
      const parsed = Date.parse(line.replace(/^Date:\s+/, ""));
      current.timestamp = Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
      continue;
    }
    if (line.startsWith("    ") || line.startsWith("\t")) {
      const text = line.replace(/^(?: {4}|\t)/, "").trimEnd();
      if (!seenSubject) {
        current.subject = text;
        seenSubject = current.subject.length > 0;
      } else {
        if (bodyStarted && pendingBlank) bodyLines.push("");
        bodyLines.push(text);
        bodyStarted = true;
        pendingBlank = false;
      }
      continue;
    }
    if (line.trim() === "") {
      if (bodyStarted) pendingBlank = true;
      continue;
    }
    if (!seenSubject) continue;
    for (const file of pathsTouched(line)) {
      const normalized = normalizeRepoPath(file);
      if (normalized) current.files.push(normalized);
    }
  }
  flush();
  return commits;
}

/**
 * List one OpenClaw folder.
 * Depth 1 lists that folder only. Opening a folder lists the next one.
 */
export async function listHulaDirectory(
  path: string,
  call: DirectoryCall,
): Promise<HulaFileEntry[]> {
  const response = await call("list_directory", {
    path,
    depth: 1,
    namesOnly: true,
  });
  if (response.isError) {
    throw new Error(
      openClawToolText(response.result) || "Could not list that directory.",
    );
  }
  return hulaDirectoryEntries(openClawToolJson(response.result));
}

type ExecCall = (
  argv: readonly string[],
  cwd: string,
) => Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated?: boolean;
}>;

/**
 * Whether Files should list the worktree on disk.
 * Checkout/worktree browse targets use HEAD. An unchecked-out branch keeps
 * the git tree at that ref (no disk listing), even when `root` is a checkout.
 */
export function hulaFilesUseWorktreeDisk(
  ref: string | null | undefined,
  list?: DirectoryCall | null,
): boolean {
  if (!list) return false;
  try {
    return hulaGitRef(ref) === "HEAD";
  } catch {
    return false;
  }
}

/**
 * Git snapshot for one OpenClaw path.
 * At HEAD with a directory listing, files come from disk and git status layers
 * tracked/untracked/ignored/modified. For any other ref, files are the tracked
 * tree at that ref. A failed history read still returns the files.
 * This does not change the checkout.
 */
export async function loadHulaFilesSnapshot(
  root: string,
  exec: ExecCall,
  options?: { list?: DirectoryCall; ref?: string },
): Promise<ProjectRepoSnapshot> {
  const normalized = hulaDirectoryPath(root);
  if (!normalized) throw new Error("Choose a directory inside Hula.");
  const ref = hulaGitRef(options?.ref);
  const useDisk = hulaFilesUseWorktreeDisk(ref, options?.list ?? null);
  if (useDisk && options?.list) {
    const [named, listed, status, diskFiles] = await Promise.all([
      readHulaCommitLog(normalized, ref, exec),
      readHulaCommitList(normalized, ref, exec),
      readWorktreeStatus(normalized, exec),
      readWorktreeFiles(normalized, options.list),
    ]);
    const commits = listed.failed
      ? named.commits.map(toRepoCommit)
      : listed.commits;
    const historyTruncated = listed.failed ? named.truncated : listed.truncated;
    return {
      latestCommit: commits[0] ?? null,
      commits,
      files: mergeHulaDiskFilesWithGit(diskFiles, named.commits, status),
      contributors: contributorsFromLog(
        listed.failed ? named.commits : commits,
      ),
      ...(historyTruncated ? { historyTruncated: true } : {}),
    };
  }
  const [paths, named, listed, dirty, sizes] = await Promise.all([
    readTrackedPaths(normalized, ref, exec),
    readHulaCommitLog(normalized, ref, exec),
    readHulaCommitList(normalized, ref, exec),
    readDirtyPaths(normalized, exec),
    readWorktreeSizes(normalized, options?.list),
  ]);
  const commits = listed.failed
    ? named.commits.map(toRepoCommit)
    : listed.commits;
  const historyTruncated = listed.failed ? named.truncated : listed.truncated;
  return {
    latestCommit: commits[0] ?? null,
    commits,
    files: filesFromGit(paths, named.commits, dirty, sizes),
    contributors: contributorsFromLog(listed.failed ? named.commits : commits),
    ...(historyTruncated ? { historyTruncated: true } : {}),
  };
}

/** People in the commit list, most commits first. The snapshot keeps the first 50. */
function contributorsFromLog(
  commits: readonly {
    authorName: string;
    authorEmail: string;
    timestamp: number;
  }[],
): ProjectRepoContributor[] {
  const byKey = new Map<string, ProjectRepoContributor>();
  for (const commit of commits) {
    const email = commit.authorEmail.trim();
    const name = commit.authorName.trim() || email;
    if (!name) continue;
    const key = (email || name).toLowerCase();
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, {
        name,
        email,
        commitCount: 1,
        lastCommitAt: commit.timestamp,
      });
      continue;
    }
    current.commitCount += 1;
    if (commit.timestamp >= current.lastCommitAt) {
      current.lastCommitAt = commit.timestamp;
      if (commit.authorName.trim()) current.name = commit.authorName.trim();
    }
  }
  return [...byKey.values()]
    .sort(
      (left, right) =>
        right.commitCount - left.commitCount ||
        right.lastCommitAt - left.lastCommitAt ||
        left.name.localeCompare(right.name),
    )
    .slice(0, HULA_CONTRIBUTOR_LIMIT);
}

/** Paths from `git diff --name-only <empty-tree> <ref>`. */
export function parseGitTrackedPaths(stdout: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const normalized = normalizeRepoPath(unquoteGitPath(line.trim()));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    paths.push(normalized);
  }
  return paths;
}

/** Tracked paths named by `git status --porcelain`. */
export function parseGitDirtyPaths(stdout: string): Set<string> {
  const dirty = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    if (line.length < 4) continue;
    const pathPart = line.slice(3).trim();
    const renamed = pathPart.split(" -> ");
    const target = unquoteGitPath(renamed[renamed.length - 1] ?? "");
    const normalized = normalizeRepoPath(target);
    if (normalized) dirty.add(normalized);
  }
  return dirty;
}

export type HulaGitStatusOverlay = {
  /** Exact path → status from porcelain. */
  byPath: Map<string, ProjectRepoFileGitStatus>;
  /** Ignored directory prefixes (no trailing slash). */
  ignoredDirs: string[];
};

/**
 * Parse `git status --porcelain --untracked-files=all --ignored`.
 * Directory entries (`!! dir/`) become ignored-dir prefixes for descendants.
 */
export function parseGitStatusOverlay(stdout: string): HulaGitStatusOverlay {
  const byPath = new Map<string, ProjectRepoFileGitStatus>();
  const ignoredDirs: string[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    if (raw.length < 4) continue;
    const code = raw.slice(0, 2);
    const pathPart = raw.slice(3).trim();
    const renamed = pathPart.split(" -> ");
    const target = unquoteGitPath(renamed[renamed.length - 1] ?? "");
    if (!target) continue;
    if (target.endsWith("/")) {
      const dir = normalizeRepoPath(target.replace(/\/+$/, ""));
      if (dir && code === "!!") ignoredDirs.push(dir);
      continue;
    }
    const normalized = normalizeRepoPath(target);
    if (!normalized) continue;
    byPath.set(normalized, statusFromPorcelainCode(code));
  }
  ignoredDirs.sort((left, right) => right.length - left.length);
  return { byPath, ignoredDirs };
}

function statusFromPorcelainCode(code: string): ProjectRepoFileGitStatus {
  if (code === "!!") return "ignored";
  if (code === "??") return "untracked";
  return "modified";
}

/** Resolve overlay status for one disk path. Missing → clean tracked. */
export function hulaGitStatusForPath(
  path: string,
  overlay: HulaGitStatusOverlay | null,
): ProjectRepoFileGitStatus {
  if (!overlay) return "tracked";
  const exact = overlay.byPath.get(path);
  if (exact) return exact;
  for (const dir of overlay.ignoredDirs) {
    if (path === dir || path.startsWith(`${dir}/`)) return "ignored";
  }
  return "tracked";
}

/**
 * Merge disk file paths with git status and last-commit metadata.
 * Pure helper for unit tests. Disk is the source of truth for which paths exist.
 */
export function mergeHulaDiskFilesWithGit(
  diskFiles: readonly { path: string; size: number | null }[],
  commits: readonly HulaLogCommit[],
  overlay: HulaGitStatusOverlay | null,
): ProjectRepoFile[] {
  const byPath = new Map<string, ProjectRepoCommit>();
  for (const commit of commits) {
    const latest = toRepoCommit(commit);
    for (const file of commit.files) {
      if (!byPath.has(file)) byPath.set(file, latest);
    }
  }
  return diskFiles.map((file) => {
    const gitStatus = overlay
      ? hulaGitStatusForPath(file.path, overlay)
      : undefined;
    const latestCommit =
      gitStatus === "untracked" || gitStatus === "ignored"
        ? null
        : (byPath.get(file.path) ?? null);
    return {
      path: file.path,
      kind: "blob",
      size: file.size,
      previewContent: null,
      lastChangedAt: latestCommit?.timestamp ?? null,
      latestCommit,
      ...(gitStatus ? { gitStatus } : {}),
    };
  });
}

async function readTrackedPaths(
  cwd: string,
  ref: string,
  exec: ExecCall,
): Promise<string[]> {
  let lastError = "Could not read the git tree.";
  for (const emptyTree of [EMPTY_TREE_SHA1, EMPTY_TREE_SHA256]) {
    const result = await exec(hulaTrackedTreeArgv(ref, emptyTree), cwd);
    if (result.exitCode === 0) return parseGitTrackedPaths(result.stdout);
    const stderr = result.stderr.trim();
    if (stderr) lastError = stderr;
  }
  throw new Error(lastError);
}

async function readHulaCommitLog(
  cwd: string,
  ref: string,
  exec: ExecCall,
): Promise<{ commits: HulaLogCommit[]; truncated: boolean }> {
  try {
    const result = await exec(hulaCommitLogArgv(ref), cwd);
    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      return { commits: [], truncated: false };
    }
    return {
      commits: parseGitMediumNameLog(result.stdout),
      truncated: hulaGitOutputWasCut(result.stdout, result.truncated),
    };
  } catch {
    return { commits: [], truncated: false };
  }
}

async function readHulaCommitList(
  cwd: string,
  ref: string,
  exec: ExecCall,
): Promise<{
  commits: ProjectRepoCommit[];
  failed: boolean;
  truncated: boolean;
}> {
  try {
    const result = await exec(hulaCommitListArgv(ref), cwd);
    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      return { commits: [], failed: true, truncated: false };
    }
    return {
      commits: parseGitMediumNameLog(result.stdout).map(toRepoCommit),
      failed: false,
      truncated: hulaGitOutputWasCut(result.stdout, result.truncated),
    };
  } catch {
    return { commits: [], failed: true, truncated: false };
  }
}

/**
 * Every commit in one OpenClaw checkout, on every local branch.
 * A failed read throws. It does not look like an empty history.
 * This does not change the checkout.
 */
export async function loadHulaAllCommits(
  root: string,
  exec: ExecCall,
): Promise<{ commits: ProjectRepoCommit[]; truncated: boolean }> {
  const normalized = hulaDirectoryPath(root);
  if (!normalized) throw new Error("Choose a directory inside Hula.");
  const result = await exec(hulaAllCommitsArgv(), normalized);
  if (typeof result.exitCode === "number" && result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || "Could not read every commit.");
  }
  return {
    commits: parseGitMediumNameLog(result.stdout).map(toRepoCommit),
    truncated: hulaGitOutputWasCut(result.stdout, result.truncated),
  };
}

async function readDirtyPaths(
  cwd: string,
  exec: ExecCall,
): Promise<Set<string> | null> {
  try {
    const result = await exec(HULA_STATUS_ARGV, cwd);
    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      return null;
    }
    return parseGitDirtyPaths(result.stdout);
  } catch {
    return null;
  }
}

async function readWorktreeStatus(
  cwd: string,
  exec: ExecCall,
): Promise<HulaGitStatusOverlay | null> {
  try {
    const result = await exec(HULA_WORKTREE_STATUS_ARGV, cwd);
    if (typeof result.exitCode === "number" && result.exitCode !== 0) {
      return null;
    }
    return parseGitStatusOverlay(result.stdout);
  } catch {
    return null;
  }
}

/** Disk files under `root` via OpenClaw `list_directory`. Skips `.git`. */
async function readWorktreeFiles(
  root: string,
  list: DirectoryCall,
): Promise<{ path: string; size: number | null }[]> {
  const response = await list("list_directory", {
    path: root,
    depth: HULA_SIZE_WALK_DEPTH,
    namesOnly: false,
  });
  if (response.isError) {
    throw new Error(
      openClawToolText(response.result) || "Could not list that directory.",
    );
  }
  const entries = hulaDirectoryEntries(openClawToolJson(response.result));
  return hulaRelativeFiles(root, entries).filter(
    (file) => file.path !== ".git" && !file.path.startsWith(".git/"),
  );
}

async function readWorktreeSizes(
  root: string,
  list: DirectoryCall | undefined,
): Promise<Map<string, number | null>> {
  if (!list) return new Map();
  try {
    const files = await readWorktreeFiles(root, list);
    return new Map(files.map((file) => [file.path, file.size]));
  } catch {
    return new Map();
  }
}

function filesFromGit(
  paths: readonly string[],
  commits: readonly HulaLogCommit[],
  dirty: Set<string> | null,
  sizes: ReadonlyMap<string, number | null>,
): ProjectRepoFile[] {
  const byPath = new Map<string, ProjectRepoCommit>();
  for (const commit of commits) {
    const latest = toRepoCommit(commit);
    for (const file of commit.files) {
      if (!byPath.has(file)) byPath.set(file, latest);
    }
  }
  return paths.map((path) => {
    const latestCommit = byPath.get(path) ?? null;
    const size = dirty && !dirty.has(path) ? (sizes.get(path) ?? null) : null;
    return {
      path,
      kind: "blob",
      size,
      previewContent: null,
      lastChangedAt: latestCommit?.timestamp ?? null,
      latestCommit,
    };
  });
}

/** Paths a commit still has after this change. Deletions do not count. */
function pathsTouched(line: string): string[] {
  const status = /^([ACDMRTUXB])(\d*)\t(.+)$/.exec(line.trim());
  if (!status) return [unquoteGitPath(line.trim())];
  const kind = status[1];
  if (kind === "D" || kind === "U" || kind === "X" || kind === "B") return [];
  const rest = status[3] ?? "";
  if (kind === "R" || kind === "C") {
    const parts = rest.split("\t");
    const dest = parts[parts.length - 1];
    return dest ? [unquoteGitPath(dest)] : [];
  }
  return [unquoteGitPath(rest)];
}

function normalizeRepoPath(path: string): string | null {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!hulaSafeRepoPath(normalized)) return null;
  return normalized;
}

function toRepoCommit(commit: HulaLogCommit): ProjectRepoCommit {
  return {
    hash: commit.hash,
    shortHash: commit.shortHash,
    authorName: commit.authorName,
    authorEmail: commit.authorEmail,
    timestamp: commit.timestamp,
    subject: commit.subject,
  };
}

/**
 * One commit from the OpenClaw checkout.
 * A missing commit returns null. This does not change the checkout.
 */
export async function loadHulaCommit(
  root: string,
  ref: string,
  exec: ExecCall,
): Promise<ProjectRepoCommit | null> {
  const safe = hulaGitRef(ref);
  const normalized = hulaDirectoryPath(root);
  if (!normalized) throw new Error("Choose a directory inside Hula.");
  const result = await exec(hulaOneCommitArgv(safe), normalized);
  if (typeof result.exitCode === "number" && result.exitCode !== 0) {
    return null;
  }
  const commit = parseGitMediumNameLog(result.stdout)[0];
  return commit ? toRepoCommit(commit) : null;
}

/**
 * Patch for one commit, parent first.
 * A root commit has no parent, so the empty tree is the other side.
 * This does not change the checkout.
 */
export async function loadHulaCommitDiff(
  root: string,
  ref: string,
  exec: ExecCall,
): Promise<ProjectRepoDiff> {
  const safe = hulaGitRef(ref);
  const normalized = hulaDirectoryPath(root);
  if (!normalized) throw new Error("Choose a directory inside Hula.");
  const parent = hulaGitRef(`${safe}~1`);
  const [patch, log] = await Promise.all([
    readCommitPatch(normalized, parent, safe, exec),
    exec(hulaOneCommitArgv(safe), normalized).catch(() => null),
  ]);
  const diff = parseUnifiedDiff(patch.stdout);
  const logged =
    log && (log.exitCode === null || log.exitCode === 0)
      ? parseGitMediumNameLog(log.stdout)[0]
      : null;
  return { ...diff, commitBody: logged?.body || null };
}

/**
 * Review diff from the OpenClaw checkout.
 * Three-dot first. A failed three-dot read tries the two-dot diff.
 * This does not change the checkout.
 */
export async function loadHulaReviewDiff(
  root: string,
  base: string,
  head: string,
  exec: ExecCall,
): Promise<ProjectRepoDiff> {
  const normalized = hulaDirectoryPath(root);
  if (!normalized) throw new Error("Choose a directory inside Hula.");
  const threeDot = await exec(hulaReviewDiffArgv(base, head), normalized);
  if (!commandFailed(threeDot)) return parseUnifiedDiff(threeDot.stdout);
  const twoDot = await exec(hulaTwoDotDiffArgv(base, head), normalized);
  if (!commandFailed(twoDot)) return parseUnifiedDiff(twoDot.stdout);
  throw new Error(
    twoDot.stderr.trim() ||
      threeDot.stderr.trim() ||
      "Could not read that review.",
  );
}

/** Changed files in one `git diff` patch. Counts come from the hunk lines. */
export function parseUnifiedDiff(stdout: string): ProjectRepoDiff {
  const files = stdout
    .split(/^diff --git /m)
    .slice(1)
    .map((part) => {
      const header = part.split("\n", 1)[0] ?? "";
      const path = diffFilePath(header);
      const capped = capPatch(`diff --git ${part}`);
      const counts = countPatchLines(capped.text);
      return {
        path,
        additions: counts.additions,
        deletions: counts.deletions,
        patch: capped.text,
        truncated: capped.truncated,
      };
    })
    .filter((file) => file.path.length > 0)
    .slice(0, HULA_DIFF_FILE_LIMIT);
  return {
    files,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    commitBody: null,
  };
}

const MISSING_PARENT = /unknown revision|bad revision|ambiguous argument/i;

async function readCommitPatch(
  root: string,
  parent: string,
  ref: string,
  exec: ExecCall,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const parentPatch = await exec(hulaCommitDiffArgv(parent, ref), root);
  if (!commandFailed(parentPatch)) return parentPatch;
  if (!MISSING_PARENT.test(parentPatch.stderr)) {
    throw new Error(parentPatch.stderr.trim() || "Could not read that commit.");
  }
  const sha1 = await exec(hulaCommitDiffArgv(EMPTY_TREE_SHA1, ref), root);
  if (!commandFailed(sha1)) return sha1;
  const sha256 = await exec(hulaCommitDiffArgv(EMPTY_TREE_SHA256, ref), root);
  if (!commandFailed(sha256)) return sha256;
  throw new Error(
    sha256.stderr.trim() ||
      parentPatch.stderr.trim() ||
      "Could not read that commit.",
  );
}

function commandFailed(result: { exitCode: number | null }): boolean {
  return typeof result.exitCode === "number" && result.exitCode !== 0;
}

function diffFilePath(header: string): string {
  const quoted = [...header.matchAll(/"((?:\\.|[^"])*)"/g)].map((match) =>
    unquoteGitPath(`"${match[1]}"`),
  );
  const sides =
    quoted.length >= 2
      ? quoted
      : quoted.length === 1
        ? [quoted[0] ?? ""]
        : header.trim().split(/\s+/);
  const bSide = [...sides].reverse().find((side) => side.startsWith("b/"));
  const aSide = sides.find((side) => side.startsWith("a/"));
  return repoPathFromDiffSide(bSide) ?? repoPathFromDiffSide(aSide) ?? "";
}

function repoPathFromDiffSide(side: string | undefined): string | null {
  if (!side || side === "/dev/null") return null;
  const stripped = side.replace(/^[ab]\//, "");
  return stripped ? normalizeRepoPath(stripped) : null;
}

function countPatchLines(patch: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

/** Same cut Buzz uses: 2000 lines, then the rest is marked truncated. */
function capPatch(patch: string): { text: string; truncated: boolean } {
  let newlines = 0;
  for (let index = 0; index < patch.length; index += 1) {
    if (patch.charCodeAt(index) !== 10) continue;
    newlines += 1;
    if (newlines === HULA_PATCH_LINE_LIMIT) {
      return { text: patch.slice(0, index), truncated: true };
    }
  }
  return { text: patch, truncated: false };
}

function readEntries(raw: unknown): HulaFileEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: HulaFileEntry[] = [];
  for (const item of raw) {
    const entry = readEntry(item);
    if (entry) entries.push(entry);
  }
  return entries.sort((left, right) => {
    const rank = (type: HulaFileEntry["type"]) =>
      type === "directory" ? 0 : 1;
    const byType = rank(left.type) - rank(right.type);
    if (byType !== 0) return byType;
    return left.name.localeCompare(right.name);
  });
}

function readEntry(item: unknown): HulaFileEntry | null {
  if (!item || typeof item !== "object") return null;
  const record = item as {
    name?: unknown;
    path?: unknown;
    type?: unknown;
    size?: unknown;
    children?: unknown;
  };
  if (typeof record.name !== "string" || typeof record.path !== "string") {
    return null;
  }
  if (!singleSegment(record.name)) return null;
  if (!ENTRY_TYPES.has(record.type as HulaFileEntry["type"])) return null;
  const size =
    typeof record.size === "number" && Number.isFinite(record.size)
      ? record.size
      : null;
  const children = Array.isArray(record.children)
    ? readEntries(record.children)
    : undefined;
  return {
    name: record.name,
    path: record.path,
    type: record.type as HulaFileEntry["type"],
    size,
    ...(children && children.length > 0 ? { children } : {}),
  };
}

function parseAuthor(line: string): { name: string; email: string } {
  const text = line.replace(/^Author:\s+/, "").trim();
  const match = /^(.*)<([^>]+)>\s*$/.exec(text);
  if (!match) return { name: text, email: "" };
  return { name: match[1].trim(), email: match[2].trim() };
}

function unquoteGitPath(path: string): string {
  if (path.length >= 2 && path.startsWith('"') && path.endsWith('"')) {
    return path.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
  }
  return path;
}

/** Shown when the Files list cannot reach OpenClaw. */
export function hulaFilesErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Could not list that directory.";
  if (/not connected|openclaw workspace grant|invoke/i.test(message)) {
    return "Connect OpenClaw, then open the files.";
  }
  return message;
}

function singleSegment(name: string): boolean {
  return (
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("\0")
  );
}
