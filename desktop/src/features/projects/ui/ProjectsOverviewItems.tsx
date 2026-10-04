import * as React from "react";

import type { UserProfileLookup } from "@/features/profile/lib/identity";
import { canDeleteProject } from "@/features/projects/projectDeletion";
import { FolderGit2, Folders } from "lucide-react";
import type {
  Project,
  ProjectActivitySummary,
  Repository,
} from "@/features/projects/hooks";
import {
  hasLocalCheckout,
  hasLocalRepositoryCheckout,
} from "@/features/projects/lib/projectLocalRepos";
import type { ProjectRepoUnavailableReason } from "@/features/projects/lib/projectRepoAvailability";
import {
  projectShareLink,
  repositoryShareLink,
} from "@/features/projects/lib/projectShareLinks";
import {
  isProjectMine,
  projectPeople,
  type ProjectsViewMode,
} from "@/features/projects/lib/projectsViewHelpers";
import {
  type ProjectSelectionItem,
  selectionItemFromProject,
  selectionItemFromRepository,
} from "@/features/projects/lib/projectSelection";
import { ProjectSelectableGroup } from "@/features/projects/ui/ProjectSelectableGroup";
import {
  EmptyFilteredState,
  ProjectGridCard,
  ProjectListRow,
} from "@/features/projects/ui/ProjectCards";
import {
  RepositoryGridCard,
  RepositoryListRow,
} from "@/features/projects/ui/RepositoryCards";
import {
  nestRepositoryListRows,
  repositoryRowRoleLabel,
  type NestedRepositoryRow,
} from "@/features/projects/lib/repositoryListRoles";
import { useIncrementalMount } from "@/shared/hooks/useIncrementalMount";
import { cn } from "@/shared/lib/cn";
import { normalizePubkey } from "@/shared/lib/pubkey";

const RESPONSIVE_CARD_GRID_CLASS =
  "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))]";

function CollectionGroup({
  children,
  icon,
  items,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  items: ProjectSelectionItem[];
  title: string;
}) {
  return (
    <ProjectSelectableGroup
      contentClassName="mt-2 space-y-0"
      count={items.length}
      groupKey={title}
      headerClassName="mx-0 gap-3 px-3"
      headerTestId="projects-collection-group-header"
      icon={icon}
      items={items}
      label={title}
      labelClassName="text-sm font-normal text-foreground/80"
      labelTestId="projects-collection-group-label"
      testId="projects-collection-group"
    >
      {children}
    </ProjectSelectableGroup>
  );
}

function repositoryIsMine(
  repository: Repository,
  currentPubkey: string | undefined,
) {
  if (!currentPubkey) return false;
  const viewer = normalizePubkey(currentPubkey);
  return (
    normalizePubkey(repository.owner) === viewer ||
    repository.contributors.some((pubkey) => normalizePubkey(pubkey) === viewer)
  );
}

function projectSelectionItems(projects: readonly Project[]) {
  return projects.map((project) =>
    selectionItemFromProject({
      channelId: project.projectChannelId,
      id: project.id,
      owner: project.owner,
      shareLink: projectShareLink(project),
      title: project.name,
    }),
  );
}

type RepositoryOverviewRow = { project: Project; repository: Repository };

function groupRepositoryRows(
  rows: readonly NestedRepositoryRow<RepositoryOverviewRow>[],
  currentPubkey: string | undefined,
) {
  const mine: NestedRepositoryRow<RepositoryOverviewRow>[] = [];
  const other: NestedRepositoryRow<RepositoryOverviewRow>[] = [];
  let bucket: NestedRepositoryRow<RepositoryOverviewRow>[] | null = null;
  for (const item of rows) {
    if (!item.nested) {
      bucket = repositoryIsMine(item.row.repository, currentPubkey)
        ? mine
        : other;
    }
    (bucket ?? mine).push(item);
  }
  return [
    { items: mine, title: "Mine" },
    { items: other, title: "Other repositories" },
  ].filter((group) => group.items.length > 0);
}

function repositorySelectionItems(
  rows: ReadonlyArray<{ project: Project; repository: Repository }>,
) {
  return rows.map((row) =>
    selectionItemFromRepository({
      channelId: row.repository.channelId ?? row.project.projectChannelId,
      id: row.repository.id,
      owner: row.repository.owner,
      shareLink: repositoryShareLink(row.repository),
      title: row.repository.name,
    }),
  );
}

// Stable fallback so a cache miss cannot hand a memoized card a fresh array.
const EMPTY_PEOPLE: string[] = [];

export function ProjectsOverviewProjectItems({
  currentPubkey,
  deleteDisabled,
  localRepoNames,
  onDelete,
  onOpen,
  onOpenTerminal,
  profiles,
  repositoryUnavailableReasonFor,
  summaries,
  viewMode,
  visibleProjects,
}: {
  currentPubkey: string | undefined;
  deleteDisabled: boolean;
  localRepoNames: Set<string>;
  onDelete: (project: Project) => void;
  onOpen: (project: Project) => void;
  onOpenTerminal: (project: Project) => void;
  profiles?: UserProfileLookup;
  repositoryUnavailableReasonFor: (
    project: Project,
  ) => ProjectRepoUnavailableReason | undefined;
  summaries?: Record<string, ProjectActivitySummary>;
  viewMode: ProjectsViewMode;
  visibleProjects: Project[];
}) {
  // One selection array shared by every row (was rebuilt per row per render —
  // O(n²) object churn that also defeated row memoization).
  const selectionRangeItems = React.useMemo(
    () =>
      visibleProjects.map((item) =>
        selectionItemFromProject({
          channelId: item.projectChannelId,
          id: item.id,
          owner: item.owner,
          shareLink: projectShareLink(item),
          title: item.name,
        }),
      ),
    [visibleProjects],
  );
  // Identity-stable people arrays: an inline projectPeople() call would hand
  // every memoized card a fresh array each render, defeating React.memo.
  const peopleByProject = React.useMemo(
    () =>
      new Map(
        visibleProjects.map((project) => [
          project.id,
          projectPeople(project, summaries?.[project.id]),
        ]),
      ),
    [summaries, visibleProjects],
  );
  // Mount cards progressively; a one-shot mount of every card blocked the
  // main thread on tab entry.
  // Cards cost ~5ms each to mount (activity bar, people stack, menus); the
  // viewport fits under a dozen, so a small first window keeps the tab-entry
  // commit short and the rest streams in within a few frames.
  // Grid cards are the expensive layout; while list view is active the
  // counter stays dormant at its initial window so a later list→grid switch
  // still mounts incrementally instead of in one full-collection commit.
  const mountedCount = useIncrementalMount(
    visibleProjects.length,
    12,
    36,
    viewMode === "grid",
  );
  const mountedProjects = React.useMemo(
    () => visibleProjects.slice(0, mountedCount),
    [mountedCount, visibleProjects],
  );
  const mountedProjectIds = React.useMemo(
    () => new Set(mountedProjects.map((project) => project.id)),
    [mountedProjects],
  );
  if (visibleProjects.length === 0) {
    return <EmptyFilteredState />;
  }
  const groups = [
    {
      items: visibleProjects.filter((project) =>
        isProjectMine(project, currentPubkey),
      ),
      title: "Mine",
    },
    {
      items: visibleProjects.filter(
        (project) => !isProjectMine(project, currentPubkey),
      ),
      title: "Other projects",
    },
  ].filter((group) => group.items.length > 0);
  if (viewMode === "grid") {
    return (
      <div className="space-y-0">
        {groups.map((group) => (
          <CollectionGroup
            icon={<Folders className="h-4 w-4" />}
            items={projectSelectionItems(group.items)}
            key={group.title}
            title={group.title}
          >
            <div className={RESPONSIVE_CARD_GRID_CLASS}>
              {group.items
                .filter((project) => mountedProjectIds.has(project.id))
                .map((project) => {
                  const summary = summaries?.[project.id];
                  return (
                    <div
                      className="[contain-intrinsic-size:auto_11rem] [content-visibility:auto]"
                      key={project.id}
                    >
                      <ProjectGridCard
                        canDelete={canDeleteProject(
                          project,
                          currentPubkey,
                          profiles,
                        )}
                        deleteDisabled={deleteDisabled}
                        hasLocal={hasLocalCheckout(project, localRepoNames)}
                        onDelete={onDelete}
                        onOpen={onOpen}
                        onOpenTerminal={onOpenTerminal}
                        people={peopleByProject.get(project.id) ?? EMPTY_PEOPLE}
                        profiles={profiles}
                        project={project}
                        repositoryUnavailableReason={repositoryUnavailableReasonFor(
                          project,
                        )}
                        summary={summary}
                      />
                    </div>
                  );
                })}
            </div>
          </CollectionGroup>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-0" data-testid="projects-list-container">
      {groups.map((group) => (
        <CollectionGroup
          icon={<Folders className="h-4 w-4" />}
          items={projectSelectionItems(group.items)}
          key={group.title}
          title={group.title}
        >
          <div>
            {group.items.map((project) => {
              const summary = summaries?.[project.id];
              return (
                <div
                  className="[contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]"
                  key={project.id}
                >
                  <ProjectListRow
                    canDelete={canDeleteProject(
                      project,
                      currentPubkey,
                      profiles,
                    )}
                    deleteDisabled={deleteDisabled}
                    hasLocal={hasLocalCheckout(project, localRepoNames)}
                    onDelete={onDelete}
                    onOpen={onOpen}
                    onOpenTerminal={onOpenTerminal}
                    people={peopleByProject.get(project.id) ?? EMPTY_PEOPLE}
                    profiles={profiles}
                    project={project}
                    repositoryUnavailableReason={repositoryUnavailableReasonFor(
                      project,
                    )}
                    selectionRangeItems={selectionRangeItems}
                    summary={summary}
                  />
                </div>
              );
            })}
          </div>
        </CollectionGroup>
      ))}
    </div>
  );
}

export function ProjectsOverviewRepositoryItems({
  currentPubkey,
  localRepoNames,
  onOpen,
  onOpenTerminal,
  profiles,
  summaries,
  viewMode,
  visibleRepositories,
}: {
  currentPubkey: string | undefined;
  localRepoNames: Set<string>;
  onOpen: (project: Project, repository: Repository) => void;
  onOpenTerminal: (repository: Repository) => void;
  profiles?: UserProfileLookup;
  summaries?: Record<string, ProjectActivitySummary>;
  viewMode: ProjectsViewMode;
  visibleRepositories: Array<{ project: Project; repository: Repository }>;
}) {
  // Mainline order stays as sorted. Subrepositories are pulled under the
  // mainline they belong to. See nestRepositoryListRows.
  const nestedRepositories = React.useMemo(
    () => nestRepositoryListRows(visibleRepositories),
    [visibleRepositories],
  );
  // Shared, identity-stable selection array (see ProjectsOverviewProjectItems).
  const selectionRangeItems = React.useMemo(
    () =>
      nestedRepositories.map((item) =>
        selectionItemFromRepository({
          channelId:
            item.row.repository.channelId ?? item.row.project.projectChannelId,
          id: item.row.repository.id,
          owner: item.row.repository.owner,
          shareLink: repositoryShareLink(item.row.repository),
          title: item.row.repository.name,
        }),
      ),
    [nestedRepositories],
  );
  // Mount cards progressively (see ProjectsOverviewProjectItems).
  // Small first window: see ProjectsOverviewProjectItems.
  // Dormant outside grid layout; see ProjectsOverviewProjectItems.
  const mountedCount = useIncrementalMount(
    nestedRepositories.length,
    12,
    36,
    viewMode === "grid",
  );
  const mountedRepositoryAddresses = React.useMemo(
    () =>
      new Set(
        nestedRepositories
          .slice(0, mountedCount)
          .map((item) => item.row.repository.repoAddress),
      ),
    [mountedCount, nestedRepositories],
  );
  if (visibleRepositories.length === 0) {
    return <EmptyFilteredState />;
  }
  const groups = groupRepositoryRows(nestedRepositories, currentPubkey);
  if (viewMode === "grid") {
    return (
      <div className="space-y-0">
        {groups.map((group) => (
          <CollectionGroup
            icon={<FolderGit2 className="h-4 w-4" />}
            items={repositorySelectionItems(
              group.items.map((item) => item.row),
            )}
            key={group.title}
            title={group.title}
          >
            <div className={RESPONSIVE_CARD_GRID_CLASS}>
              {group.items
                .filter((item) =>
                  mountedRepositoryAddresses.has(
                    item.row.repository.repoAddress,
                  ),
                )
                .map((item) => (
                  <div
                    className="[contain-intrinsic-size:auto_11rem] [content-visibility:auto]"
                    data-repository-role={item.role.kind}
                    key={item.row.repository.repoAddress}
                  >
                    <RepositoryGridCard
                      hasLocal={hasLocalRepositoryCheckout(
                        item.row.repository,
                        localRepoNames,
                      )}
                      onOpen={onOpen}
                      onOpenTerminal={onOpenTerminal}
                      profiles={profiles}
                      project={item.row.project}
                      repository={item.row.repository}
                      roleLabel={repositoryRowRoleLabel(item.role)}
                      summary={summaries?.[item.row.repository.repoAddress]}
                    />
                  </div>
                ))}
            </div>
          </CollectionGroup>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-0" data-testid="projects-list-container">
      {groups.map((group) => (
        <CollectionGroup
          icon={<FolderGit2 className="h-4 w-4" />}
          items={repositorySelectionItems(group.items.map((item) => item.row))}
          key={group.title}
          title={group.title}
        >
          <div>
            {group.items.map((item) => (
              <div
                className={cn(
                  "[contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]",
                  item.nested && "ml-6 border-l border-border/60",
                )}
                data-repository-role={item.role.kind}
                key={item.row.repository.repoAddress}
              >
                <RepositoryListRow
                  hasLocal={hasLocalRepositoryCheckout(
                    item.row.repository,
                    localRepoNames,
                  )}
                  onOpen={onOpen}
                  onOpenTerminal={onOpenTerminal}
                  profiles={profiles}
                  project={item.row.project}
                  repository={item.row.repository}
                  roleLabel={repositoryRowRoleLabel(item.role)}
                  selectionRangeItems={selectionRangeItems}
                  summary={summaries?.[item.row.repository.repoAddress]}
                />
              </div>
            ))}
          </div>
        </CollectionGroup>
      ))}
    </div>
  );
}
