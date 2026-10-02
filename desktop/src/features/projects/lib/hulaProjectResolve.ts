import { MAX_PROJECT_MEMBERS } from "@/features/projects/projectModels";
import {
  hulaDirectoryPath,
  hulaProjectStartPath,
  projectNameFromHulaPath,
} from "@/features/projects/lib/hulaProjectNames";

const SKIP_DIR_NAMES = new Set([".git", "node_modules", ".worktrees"]);
const MAX_DIRECTORIES = 400;

export type WorkspaceStat = {
  type: "file" | "directory" | "symlink" | "other";
};

export type WorkspaceEntry = {
  name: string;
  path: string;
  type: string;
  children?: WorkspaceEntry[];
};

/** Closed set of OpenClaw reads the project screen uses. */
export type WorkspaceClient = {
  statPath(path: string): Promise<WorkspaceStat | null>;
  listDirectory(path: string): Promise<WorkspaceEntry[]>;
};

export type ResolvedHulaProject = {
  hulaPath: string;
  /** Root path plus every nested git directory. */
  repoPaths: string[];
};

/**
 * Resolve a remote path or Porthole link to one git directory inside Hula.
 * A file or plain folder walks up to the nearest `.git` that stays inside Hula.
 */
export async function resolveHulaProjectDirectory(
  input: string,
  client: WorkspaceClient,
): Promise<ResolvedHulaProject> {
  const start = hulaProjectStartPath(input);
  if (!start) {
    throw new Error("Choose a directory inside Hula.");
  }
  const root = await walkToGitRoot(start, client);
  if (!root || !projectNameFromHulaPath(root)) {
    throw new Error("Choose a git repository inside Hula.");
  }
  const repoPaths = await listGitRepositories(root, client);
  return { hulaPath: root, repoPaths };
}

export async function listGitRepositories(
  root: string,
  client: WorkspaceClient,
): Promise<string[]> {
  const normalizedRoot = hulaDirectoryPath(root);
  if (!normalizedRoot) {
    throw new Error("Choose a directory inside Hula.");
  }
  const found = new Set<string>();
  if (await hasGit(normalizedRoot, client)) found.add(normalizedRoot);
  const entries = await client.listDirectory(normalizedRoot);
  let seen = 0;
  const walk = async (children: readonly WorkspaceEntry[] | undefined) => {
    for (const child of children ?? []) {
      if (child.type !== "directory") continue;
      if (SKIP_DIR_NAMES.has(child.name)) continue;
      seen += 1;
      if (seen > MAX_DIRECTORIES) {
        throw new Error("This folder is too large to scan.");
      }
      const path = hulaDirectoryPath(child.path) ?? child.path;
      if (!path.startsWith(`${normalizedRoot}/`)) continue;
      if (await hasGit(path, client)) {
        found.add(path);
        if (found.size > MAX_PROJECT_MEMBERS) {
          throw new Error(
            `A project can include at most ${MAX_PROJECT_MEMBERS} repositories.`,
          );
        }
      }
      if (child.children && child.children.length > 0) {
        await walk(child.children);
      }
    }
  };
  await walk(entries);
  return [...found].sort((left, right) => {
    if (left === normalizedRoot) return -1;
    if (right === normalizedRoot) return 1;
    return left.localeCompare(right);
  });
}

async function walkToGitRoot(
  start: string,
  client: WorkspaceClient,
): Promise<string | null> {
  let current: string | null = start;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (await hasGit(current, client)) return current;
    current = parentInsideHula(current);
  }
  return null;
}

async function hasGit(
  directory: string,
  client: WorkspaceClient,
): Promise<boolean> {
  const stat = await client.statPath(`${directory}/.git`);
  return stat?.type === "file" || stat?.type === "directory";
}

function parentInsideHula(path: string): string | null {
  const parts = path.split("/");
  if (parts.length <= 2) return null;
  parts.pop();
  if (parts[0] !== "Hula" || parts.length < 2) return null;
  return parts.join("/");
}
