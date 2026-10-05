/** Postgres `channels.name` is VARCHAR(255). The stored name is characters, not bytes. */
export const CHANNEL_NAME_MAX_CHARS = 255;

const HULA_PREFIX = "Hula/";
const PROJECTS_PREFIX = "Hula/projects/";

/**
 * Reduce an OpenClaw path to a `Hula/...` directory.
 * Returns null when the path leaves Hula or walks through `..`.
 */
export function hulaDirectoryPath(input: string): string | null {
  const trimmed = input.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.includes("\0")) return null;

  let relative = trimmed;
  const workspaceMarker = "/.openclaw/workspace/";
  const markerAt = relative.indexOf(workspaceMarker);
  if (markerAt !== -1) {
    relative = relative.slice(markerAt + workspaceMarker.length);
  }
  relative = relative.replace(/^~\/Documents\/Hula\/?/, "Hula/");
  relative = relative.replace(/^\/+/, "");

  const segments: string[] = [];
  for (const segment of relative.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") return null;
    segments.push(segment);
  }
  // Absolute Mac/Linux paths like /Users/jm/Documents/Hula/products/hulabill
  // become Users/jm/Documents/Hula/... after the leading-slash strip — cut at Hula.
  const hulaIndex = segments.indexOf("Hula");
  if (hulaIndex > 0) {
    segments.splice(0, hulaIndex);
  }
  if (segments[0] !== "Hula" || segments.length < 2) return null;
  return segments.join("/");
}

/** Display name for a project directory. `Hula/projects/` is not part of the name. */
export function projectNameFromHulaPath(hulaPath: string): string | null {
  const path = hulaDirectoryPath(hulaPath);
  if (!path || path === "Hula/projects") return null;
  const rest = path.startsWith(PROJECTS_PREFIX)
    ? path.slice(PROJECTS_PREFIX.length)
    : path.slice(HULA_PREFIX.length);
  if (!rest || rest.split("/").some((segment) => segment.length === 0)) {
    return null;
  }
  return rest.replaceAll("/", "_");
}

/**
 * Repository announcement name for one OpenClaw checkout.
 * This is the workspace directory, not the project name. A git remote that
 * uses another repo name is not consulted: the workspace identifies the
 * checkout by this directory.
 */
export function repositoryNameFromHulaPath(hulaPath: string): string | null {
  const path = hulaDirectoryPath(hulaPath);
  if (!path) return null;
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (!name || name === "." || name === "..") return null;
  if (new TextEncoder().encode(name).byteLength > 256) {
    throw new Error("The repository name is too long.");
  }
  return name;
}

/** Channel for one repo directory under the project. */
export function repoChannelName(
  projectName: string,
  repoSubPath: string,
): string | null {
  const sub = repoSubPath
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!projectName.trim() || !sub || sub.split("/").includes("..")) return null;
  return joinChannelName(projectName.trim(), sub.replaceAll("/", "_"));
}

/**
 * Channel for one slug directory under a member repo's `plans/` folder.
 * The directory name is the slug. A plan in the project root omits the stack segment.
 */
export function hulaProjectChannelName(
  projectName: string,
  stackSubPath: string | null,
  hulaProjectSlug: string,
): string | null {
  const slug = hulaProjectSlug.trim();
  if (
    !projectName.trim() ||
    !slug ||
    slug.includes("/") ||
    slug.includes("..")
  ) {
    return null;
  }
  const stack =
    stackSubPath
      ?.trim()
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "") ?? "";
  if (stack.split("/").includes("..")) return null;
  const stackName = stack ? stack.replaceAll("/", "_") : "";
  return joinChannelName(
    projectName.trim(),
    ...(stackName ? [stackName] : []),
    slug,
  );
}

/** Smallest free collision suffix. `2` produces `name (2)`. */
export function channelNameWithSuffix(name: string, n: number): string | null {
  if (!Number.isInteger(n) || n < 2) return null;
  return channelNameOrNull(`${name} (${n})`);
}

export function channelNameFits(name: string): boolean {
  return name.trim().length > 0 && [...name].length <= CHANNEL_NAME_MAX_CHARS;
}

/** Porthole links carry the workspace path in `path` and an optional `file`. */
export function portholeTarget(
  input: string,
): { path: string; file: string | null } | null {
  const trimmed = input.trim();
  if (!trimmed.includes("path=")) return null;
  let url: URL;
  try {
    url = new URL(trimmed, "http://porthole.local");
  } catch {
    return null;
  }
  const path = url.searchParams.get("path")?.trim() ?? "";
  if (!path) return null;
  const file = url.searchParams.get("file")?.trim() || null;
  return { path, file };
}

/**
 * First directory to inspect. A Porthole `file` is joined onto `path`
 * so the walk can climb from that file to the repo.
 */
export function hulaProjectStartPath(input: string): string | null {
  const link = portholeTarget(input);
  const raw = link
    ? link.file
      ? `${link.path.replace(/\/+$/, "")}/${link.file.replace(/^\/+/, "")}`
      : link.path
    : input;
  return hulaDirectoryPath(raw);
}

/**
 * First project keeps `name`. The next free name is `name (2)`, then `(3)`.
 * Match is exact, including case.
 */
export function allocateDisplayName(
  name: string,
  taken: readonly string[],
): string | null {
  const base = name.trim();
  if (!channelNameFits(base)) return null;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = channelNameWithSuffix(base, n);
    if (!candidate) return null;
    if (!used.has(candidate)) return candidate;
  }
  return null;
}

function joinChannelName(...parts: string[]): string | null {
  return channelNameOrNull(parts.join("_"));
}

function channelNameOrNull(name: string): string | null {
  return channelNameFits(name) ? name : null;
}
