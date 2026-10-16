import type { Project } from "@/features/projects/projectModels";
import { isExplicitProject } from "@/features/projects/projectModels";
import { listProjectBoundChannels } from "@/features/projects/lib/projectRelatedChannels";
import { isProjectOwnedByCurrentUser } from "@/features/projects/lib/projectsViewHelpers";

const SIDEBAR_PROJECTS_FILTER_KEY = "buzz.sidebar.projects.filter";
const SIDEBAR_PROJECTS_SORT_KEY = "buzz.sidebar.projects.sort";
const SIDEBAR_PROJECTS_EXPANDED_KEY = "buzz.sidebar.projects.expanded";

export type SidebarProjectsFilter = "added" | "owned";
export type SidebarProjectsSort = "name" | "created";
export type SidebarProjectExpansionState = Record<string, boolean>;

// Every persisted sidebar preference — filter, sort, expansion, membership —
// is scoped to the relay+pubkey identity: a community or identity switch must
// not leak one tenant's view of the sidebar into another.
function scopedPreferenceKey(
  baseKey: string,
  relayOrigin: string | null,
  currentPubkey?: string,
) {
  return `${baseKey}:${encodeURIComponent(relayOrigin ?? "unknown")}:${currentPubkey ?? "anonymous"}`;
}

function expandedProjectsStorageKey(
  relayOrigin: string | null,
  currentPubkey?: string,
) {
  return scopedPreferenceKey(
    SIDEBAR_PROJECTS_EXPANDED_KEY,
    relayOrigin,
    currentPubkey,
  );
}

export function readSidebarProjectExpansion(
  relayOrigin: string | null,
  currentPubkey?: string,
): SidebarProjectExpansionState {
  try {
    const value = globalThis.localStorage?.getItem(
      expandedProjectsStorageKey(relayOrigin, currentPubkey),
    );
    if (!value) return {};
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => {
        return typeof entry[1] === "boolean";
      }),
    );
  } catch {
    return {};
  }
}

export function writeSidebarProjectExpansion(
  expansion: SidebarProjectExpansionState,
  relayOrigin: string | null,
  currentPubkey?: string,
) {
  try {
    globalThis.localStorage?.setItem(
      expandedProjectsStorageKey(relayOrigin, currentPubkey),
      JSON.stringify(expansion),
    );
  } catch {
    // Persistence is best-effort; the in-memory toggle still works.
  }
}

export function selectedProjectRouteId(pathname: string): string | undefined {
  if (!pathname.startsWith("/projects/")) return undefined;
  const raw = pathname.slice("/projects/".length).split("/")[0];
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function selectedChannelRouteId(pathname: string): string | undefined {
  if (!pathname.startsWith("/channels/")) return undefined;
  const raw = pathname.slice("/channels/".length).split("/")[0];
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function readSidebarProjectsFilter(
  relayOrigin: string | null,
  currentPubkey?: string,
): SidebarProjectsFilter {
  try {
    const value = globalThis.localStorage?.getItem(
      scopedPreferenceKey(
        SIDEBAR_PROJECTS_FILTER_KEY,
        relayOrigin,
        currentPubkey,
      ),
    );
    return value === "owned" ? "owned" : "added";
  } catch {
    return "added";
  }
}

export function writeSidebarProjectsFilter(
  filter: SidebarProjectsFilter,
  relayOrigin: string | null,
  currentPubkey?: string,
) {
  try {
    globalThis.localStorage?.setItem(
      scopedPreferenceKey(
        SIDEBAR_PROJECTS_FILTER_KEY,
        relayOrigin,
        currentPubkey,
      ),
      filter,
    );
  } catch {
    // Persistence is best-effort; the in-memory toggle still works.
  }
}

export function readSidebarProjectsSort(
  relayOrigin: string | null,
  currentPubkey?: string,
): SidebarProjectsSort {
  try {
    const value = globalThis.localStorage?.getItem(
      scopedPreferenceKey(
        SIDEBAR_PROJECTS_SORT_KEY,
        relayOrigin,
        currentPubkey,
      ),
    );
    return value === "created" ? "created" : "name";
  } catch {
    return "name";
  }
}

export function writeSidebarProjectsSort(
  sort: SidebarProjectsSort,
  relayOrigin: string | null,
  currentPubkey?: string,
) {
  try {
    globalThis.localStorage?.setItem(
      scopedPreferenceKey(
        SIDEBAR_PROJECTS_SORT_KEY,
        relayOrigin,
        currentPubkey,
      ),
      sort,
    );
  } catch {
    // Persistence is best-effort; the in-memory toggle still works.
  }
}

export function listSidebarProjects({
  addedProjectAddresses,
  currentPubkey,
  filter,
  memberChannelIds,
  projects,
  sort,
}: {
  addedProjectAddresses: ReadonlySet<string>;
  /**
   * Channels the viewer belongs to. When the synced "added" list is empty
   * (not decrypted yet, decrypt failed on a web remote signer, or never
   * synced to this device) the "added" view falls back to projects the
   * viewer owns or whose home channel they are a member of, so the sidebar
   * never depends on a NIP-44 decrypt to show projects.
   */
  memberChannelIds?: ReadonlySet<string>;
  currentPubkey: string | undefined;
  filter: SidebarProjectsFilter;
  projects: readonly Project[];
  sort: SidebarProjectsSort;
}): Project[] {
  // The two modes are independent views: "added" lists explicit sidebar
  // membership, while "owned" must surface every project the viewer owns —
  // including ones never added to the sidebar.
  const matchesFilter =
    filter === "owned"
      ? (project: Project) =>
          isProjectOwnedByCurrentUser(project, currentPubkey)
      : addedProjectAddresses.size > 0
        ? (project: Project) =>
            addedProjectAddresses.has(project.projectAddress)
        : (project: Project) =>
            isProjectOwnedByCurrentUser(project, currentPubkey) ||
            (project.projectChannelId != null &&
              (memberChannelIds?.has(project.projectChannelId) ?? false));
  return projects
    .filter(isExplicitProject)
    .filter(matchesFilter)
    .sort((left, right) => {
      if (sort === "created") {
        return (
          right.createdAt - left.createdAt ||
          left.name.localeCompare(right.name)
        );
      }
      return left.name.localeCompare(right.name);
    });
}

/**
 * Channel ids that the sidebar Projects section already renders (each listed
 * project's home channel plus its related/repo sub-channels). The default
 * Channels list hides these so project channels appear only under Projects.
 */
export function sidebarProjectChannelIds(
  projects: readonly Project[],
): Set<string> {
  const ids = new Set<string>();
  for (const project of projects) {
    for (const binding of listProjectBoundChannels(project)) {
      ids.add(binding.channelId);
    }
  }
  return ids;
}

/**
 * Split the ungrouped Channels bucket: only channels with no explicit
 * personal/community section placement reach here, so this never hides a
 * project channel the user deliberately put in a section.
 */
export function excludeProjectChannelsFromUngrouped<T extends { id: string }>(
  ungrouped: readonly T[],
  projectChannelIds: ReadonlySet<string>,
): T[] {
  if (projectChannelIds.size === 0) return [...ungrouped];
  return ungrouped.filter((channel) => !projectChannelIds.has(channel.id));
}
