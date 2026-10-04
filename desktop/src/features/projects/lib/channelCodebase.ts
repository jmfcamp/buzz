import { hulaDirectoryPath } from "@/features/projects/lib/hulaProjectNames";

/** Read-only. The checkout's origin remote, not a guessed URL. */
export const CODEBASE_ORIGIN_ARGV = [
  "git",
  "remote",
  "get-url",
  "origin",
] as const;

export type ChannelCodebaseRepository = {
  id: string;
  dtag: string;
  name: string;
  repoAddress: string;
  channelId?: string | null;
  hulaPath?: string | null;
  cloneUrls?: readonly string[];
  webUrl?: string | null;
  eventTags?: readonly (readonly string[])[] | null;
};

export type ChannelCodebaseProject = {
  dtag: string;
  hulaPath?: string | null;
  projectChannelId: string | null;
  primaryRepositoryAddress: string | null;
  repositories: readonly ChannelCodebaseRepository[];
};

export type GitHubOrigin = {
  owner: string;
  repo: string;
  url: string;
};

export type CodebaseOriginView =
  | ({ kind: "github" } & GitHubOrigin)
  | { kind: "link"; label: string; url: string }
  | { kind: "text"; label: string }
  | { kind: "unset" };

/**
 * The repository this project channel was built around.
 * A Hula root is the repo whose path is the project path.
 * Otherwise it is the repo bound to the home channel, and when several
 * repos share that channel, the one already marked primary (same `d` tag
 * or `primaryRepositoryAddress`). Other members stay on the project.
 */
export function projectChannelPrimaryRepository(
  project: ChannelCodebaseProject,
): ChannelCodebaseRepository | null {
  const root = project.hulaPath ? hulaDirectoryPath(project.hulaPath) : null;
  if (root) {
    const byPath = project.repositories.find((repository) => {
      if (!repository.hulaPath) return false;
      return hulaDirectoryPath(repository.hulaPath) === root;
    });
    if (byPath) return byPath;
  }

  const homeId = project.projectChannelId;
  const homeBound = homeId
    ? project.repositories.filter(
        (repository) => repository.channelId === homeId,
      )
    : [];
  const marked = markedPrimary(project, homeBound);
  if (marked) return marked;
  if (homeBound.length === 1) return homeBound[0] ?? null;
  return markedPrimary(project, project.repositories);
}

/** Repos in the project that are not the channel's primary codebase. */
export function projectChannelSubRepositories(
  project: ChannelCodebaseProject,
): ChannelCodebaseRepository[] {
  const primary = projectChannelPrimaryRepository(project);
  if (!primary) return [...project.repositories];
  return project.repositories.filter(
    (repository) => repository.id !== primary.id,
  );
}

function markedPrimary(
  project: ChannelCodebaseProject,
  repositories: readonly ChannelCodebaseRepository[],
): ChannelCodebaseRepository | null {
  return (
    repositories.find(
      (repository) =>
        repository.repoAddress === project.primaryRepositoryAddress,
    ) ??
    repositories.find((repository) => repository.dtag === project.dtag) ??
    null
  );
}

/** Default branch only when the repository announcement stored one. */
export function loadedDefaultBranch(
  repository: { eventTags?: readonly (readonly string[])[] | null } | null,
): string | null {
  const value = repository?.eventTags
    ?.find((tag) => tag[0] === "default-branch")?.[1]
    ?.trim();
  if (!value || value.startsWith("-")) return null;
  return value;
}

/**
 * Clone and web URLs the announcement actually stored.
 * A missing tag list may use `cloneUrls`. A present tag list does not,
 * so a synthesized relay clone URL is not treated as an origin.
 */
export function storedRepositoryRemotes(
  repository: ChannelCodebaseRepository | null | undefined,
): string[] {
  if (!repository) return [];
  if (repository.eventTags) {
    const remotes: string[] = [];
    for (const tag of repository.eventTags) {
      if (tag[0] === "clone") {
        remotes.push(
          ...tag.slice(1).filter((value) => value.trim().length > 0),
        );
      } else if (tag[0] === "web" && tag[1]?.trim()) {
        remotes.push(tag[1].trim());
      }
    }
    return remotes;
  }
  return [...(repository.cloneUrls ?? []), repository.webUrl ?? ""].filter(
    (value) => value.trim().length > 0,
  );
}

function cleanGithubSegment(value: string): string | null {
  let segment = value.trim();
  try {
    segment = decodeURIComponent(segment);
  } catch {
    return null;
  }
  segment = segment.replace(/\.git$/i, "");
  if (
    !segment ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\") ||
    /\s/.test(segment)
  ) {
    return null;
  }
  return segment;
}

/** `owner/repo` from a real GitHub remote. Other hosts return null. */
export function githubOriginFromRemote(remote: string): GitHubOrigin | null {
  const raw = remote.trim();
  if (!raw || /\s/.test(raw)) return null;
  const scp = /^git@github\.com:([^/\s]+)\/([^/\s]+)$/i.exec(raw);
  if (scp) {
    const owner = cleanGithubSegment(scp[1] ?? "");
    const repo = cleanGithubSegment(scp[2] ?? "");
    if (!owner || !repo) return null;
    return { owner, repo, url: `https://github.com/${owner}/${repo}` };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;
  if (
    url.protocol !== "https:" &&
    url.protocol !== "ssh:" &&
    url.protocol !== "git:"
  ) {
    return null;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const owner = cleanGithubSegment(parts[0] ?? "");
  const repo = cleanGithubSegment(parts[1] ?? "");
  if (!owner || !repo) return null;
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

function remoteLabel(url: URL): string {
  const path = url.pathname.replace(/\.git$/i, "").replace(/\/+$/, "");
  return `${url.host}${path}`;
}

/** One remote string. GitHub becomes owner/repo. Anything else keeps its real URL. */
export function codebaseOriginFromRemote(remote: string): CodebaseOriginView {
  const trimmed = remote.trim();
  if (!trimmed) return { kind: "unset" };
  const github = githubOriginFromRemote(trimmed);
  if (github) return { kind: "github", ...github };
  try {
    const url = new URL(trimmed);
    url.username = "";
    url.password = "";
    url.hash = "";
    if (url.protocol === "https:" || url.protocol === "http:") {
      return { kind: "link", label: remoteLabel(url), url: url.toString() };
    }
  } catch {
    // Not a URL. Show the remote text and do not invent a link.
  }
  return { kind: "text", label: trimmed };
}

/**
 * A live `git remote get-url origin` wins.
 * When that read is absent, use stored clone/web metadata.
 * An empty live read still falls through to stored metadata.
 */
export function resolveCodebaseOrigin(
  liveRemote: string | null | undefined,
  storedRemotes: readonly string[],
): CodebaseOriginView {
  const live = liveRemote?.trim();
  if (live) return codebaseOriginFromRemote(live);
  for (const remote of storedRemotes) {
    const origin = codebaseOriginFromRemote(remote);
    if (origin.kind === "github") return origin;
  }
  for (const remote of storedRemotes) {
    const origin = codebaseOriginFromRemote(remote);
    if (origin.kind !== "unset") return origin;
  }
  return { kind: "unset" };
}
