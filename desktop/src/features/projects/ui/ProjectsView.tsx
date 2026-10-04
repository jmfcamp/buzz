import { Plus } from "lucide-react";
import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import {
  useChannelsQuery,
  useOpenDmMutation,
} from "@/features/channels/hooks";
import {
  type ProfilePanelTab,
  type ProfilePanelView,
  UserProfilePanel,
} from "@/features/profile/ui/UserProfilePanel";
import {
  profilePanelTabFromSearch,
  profilePanelViewFromSearch,
} from "@/features/profile/ui/UserProfilePanelUtils";
import { useIdentityQuery } from "@/shared/api/hooks";
import { ProfilePanelProvider } from "@/shared/context/ProfilePanelContext";
import { useHistorySearchState } from "@/shared/hooks/useHistorySearchState";
import { useThreadPanelWidth } from "@/shared/hooks/useThreadPanelWidth";
import {
  type Project,
  type ProjectIssue,
  type Repository,
  useProjectActivitySummariesQuery,
  useProjectsQuery,
  useProjectsWorkItemsQuery,
} from "@/features/projects/hooks";
import { useRepositoryActivitySummariesQuery } from "@/features/projects/repositoryActivityHooks";
import { isExplicitProject } from "@/features/projects/projectModels";
import { hasAuthoritativeHomeBinding } from "@/features/projects/lib/projectHomeChannel";
import {
  repositoryRowOpenTarget,
  repositoryRowRole,
} from "@/features/projects/lib/repositoryListRoles";
import { projectsWithWorkItemRepositories } from "@/features/projects/projectWorkItems";
import {
  buildProjectsIndexTree,
  type ProjectsIndexChannel,
} from "@/features/projects/lib/projectsIndexTree";
import { EmptyState } from "@/features/projects/ui/ProjectCards";
import { ProjectCreationDialog } from "@/features/projects/ui/ProjectCreationDialog";
import { ProjectsIndexActivity } from "@/features/projects/ui/ProjectsIndexActivity";
import { ProjectsIndexTree } from "@/features/projects/ui/ProjectsIndexTree";
import { ProjectsWorkspaceChrome } from "@/features/projects/ui/ProjectDetailChrome";
import { ProjectsWorkItemsLoadNotice } from "@/features/projects/ui/ProjectsWorkItemsLoadNotice";
import { ProjectsSectionSearch } from "@/features/projects/ui/ProjectsSectionSearch";
import { PROJECT_COLUMN_HEADER_BACKDROP_CLASS } from "@/features/projects/ui/projectPanelStyles";
import {
  getProjectUpdatedAt,
  type ProjectsSort,
  readStoredSort,
  writeStoredSort,
} from "@/features/projects/lib/projectsViewHelpers";
import { useProjectsScrollIndicator } from "@/features/projects/ui/useProjectsScrollIndicator";
import { useMediaBreakpoint } from "@/shared/hooks/use-mobile";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";
import { topChromeInset } from "@/shared/layout/chromeLayout";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { useOptionalSidebar } from "@/shared/ui/sidebar";

const PROJECTS_CONTEXT_POD_MIN_VIEWPORT_PX = 1024;

const PROJECTS_PANEL_SEARCH_KEYS = [
  "profile",
  "profileTab",
  "profileView",
] as const;

export function ProjectsView() {
  const { goChannel, goProject } = useAppNavigation();
  const identityQuery = useIdentityQuery();
  const { applyPatch, values } = useHistorySearchState(PROJECTS_PANEL_SEARCH_KEYS);
  const profilePanelPubkey = values.profile;
  const profilePanelTab = profilePanelTabFromSearch(values.profileTab);
  const profilePanelView = profilePanelViewFromSearch(values.profileView);
  const handleOpenProfilePanel = React.useCallback(
    (pubkey: string) =>
      applyPatch({ profile: pubkey, profileTab: null, profileView: null }),
    [applyPatch],
  );
  const handleCloseProfilePanel = React.useCallback(
    () => applyPatch({ profile: null, profileTab: null, profileView: null }),
    [applyPatch],
  );
  const handleProfilePanelViewChange = React.useCallback(
    (view: ProfilePanelView, options?: { replace?: boolean }) =>
      applyPatch({ profileView: view === "summary" ? null : view }, options),
    [applyPatch],
  );
  const handleProfilePanelTabChange = React.useCallback(
    (tab: ProfilePanelTab, options?: { replace?: boolean }) =>
      applyPatch({ profileTab: tab === "info" ? null : tab }, options),
    [applyPatch],
  );
  const threadPanelWidth = useThreadPanelWidth();
  const openDmMutation = useOpenDmMutation();
  const handleOpenDm = React.useCallback(
    async (pubkeys: string[]) => {
      const dm = await openDmMutation.mutateAsync({ pubkeys });
      await goChannel(dm.id);
    },
    [goChannel, openDmMutation],
  );
  const sidebar = useOptionalSidebar();
  const { handleContentScroll, scrollIndicatorRef } =
    useProjectsScrollIndicator();
  const projectsQuery = useProjectsQuery();
  const projectReadModels = projectsQuery.data ?? [];
  const projects = React.useMemo(
    () => projectReadModels.filter(isExplicitProject),
    [projectReadModels],
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const isNarrowProjectsLayout = useMediaBreakpoint(
    PROJECTS_CONTEXT_POD_MIN_VIEWPORT_PX,
  );
  const activitySummariesQuery = useProjectActivitySummariesQuery(projects);
  const repositoryActivitySummariesQuery =
    useRepositoryActivitySummariesQuery(projects);
  const workItemProjects = React.useMemo(
    () => projectsWithWorkItemRepositories(projectReadModels),
    [projectReadModels],
  );
  const projectsWorkItemsQuery = useProjectsWorkItemsQuery(workItemProjects);
  const channelsQuery = useChannelsQuery({ enabled: projects.length > 0 });
  const channelsById = React.useMemo(() => {
    const map = new Map<string, ProjectsIndexChannel>();
    for (const channel of channelsQuery.data ?? []) {
      map.set(channel.id, channel);
    }
    return map;
  }, [channelsQuery.data]);
  const [createProjectOpen, setCreateProjectOpen] = React.useState(false);
  const [collapsedProjectIds, setCollapsedProjectIds] = React.useState<
    ReadonlySet<string>
  >(() => new Set());
  const [activityCollapsed, setActivityCollapsed] = React.useState(false);
  const [sort, setSort] = React.useState<ProjectsSort>(() => readStoredSort());

  const handleSortChange = React.useCallback((nextSort: ProjectsSort) => {
    setSort(nextSort);
    writeStoredSort(nextSort);
  }, []);

  const sortedProjects = React.useMemo(() => {
    return [...projects].sort((left, right) => {
      const leftSummary = activitySummariesQuery.data?.[left.id];
      const rightSummary = activitySummariesQuery.data?.[right.id];
      if (sort === "name") return left.name.localeCompare(right.name);
      if (sort === "created") return right.createdAt - left.createdAt;
      return (
        getProjectUpdatedAt(right, rightSummary) -
        getProjectUpdatedAt(left, leftSummary)
      );
    });
  }, [activitySummariesQuery.data, projects, sort]);

  const sortedIssues = React.useMemo(() => {
    const issues = projectsWorkItemsQuery.data?.issues.items ?? [];
    return [...issues].sort((left, right) => {
      if (sort === "name") {
        return left.issue.title.localeCompare(right.issue.title);
      }
      if (sort === "created") {
        return right.issue.createdAt - left.issue.createdAt;
      }
      return right.issue.updatedAt - left.issue.updatedAt;
    });
  }, [projectsWorkItemsQuery.data, sort]);

  const tree = React.useMemo(
    () =>
      buildProjectsIndexTree({
        channelsById,
        issues: sortedIssues,
        projects: sortedProjects,
        searchQuery,
        sort,
      }),
    [channelsById, searchQuery, sort, sortedIssues, sortedProjects],
  );
  const visibleProjects = React.useMemo(
    () => tree.map((node) => node.project),
    [tree],
  );
  const handleToggleProject = React.useCallback((projectId: string) => {
    setCollapsedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);
  const handleExpandAll = React.useCallback(() => {
    setCollapsedProjectIds(new Set());
  }, []);
  const handleCollapseAll = React.useCallback(() => {
    setCollapsedProjectIds(
      new Set(visibleProjects.map((project) => project.id)),
    );
  }, [visibleProjects]);
  const handleOpenProject = React.useCallback(
    (project: Project) => {
      void goProject(project.id);
    },
    [goProject],
  );

  const handleOpenRepository = React.useCallback(
    (project: Project, repository: Repository) => {
      // The repositories index opens chat, not the repository Read Me page.
      // Prefer the project that actually has a home channel when the row is a
      // legacy repository. A subrepository opens the channel bound to that
      // repo when Buzz stored one that is not the project home.
      const channelProject =
        (hasAuthoritativeHomeBinding(project) ? project : null) ??
        projectReadModels.find(
          (candidate) =>
            hasAuthoritativeHomeBinding(candidate) &&
            candidate.repositories.some(
              (item) => item.repoAddress === repository.repoAddress,
            ),
        ) ??
        project;
      const bound =
        channelProject.repositories.find(
          (item) => item.repoAddress === repository.repoAddress,
        ) ?? repository;
      const open = repositoryRowOpenTarget({
        projectChannelId: channelProject.projectChannelId,
        projectId: channelProject.id,
        repositoryChannelId: bound.channelId ?? repository.channelId,
        // Same project the row is labeled from, so Mainline and Subrepository
        // clicks follow the label.
        role: repositoryRowRole({ project, repository }),
      });
      if (open.missingSubchannel || !open.target) {
        // No distinct buzz-channel for this subrepository. Do not open the
        // parent project channel or the old Overview workspace.
        console.warn(
          `No buzz-channel for subrepository ${bound.repoAddress} (repo id ${bound.id}); cannot open its channel.`,
        );
        return;
      }
      if (open.target.kind === "repository-channel") {
        void goChannel(open.target.channelId);
        return;
      }
      void goProject(open.target.projectId);
    },
    [goChannel, goProject, projectReadModels],
  );

  const handleOpenIssue = React.useCallback(
    (project: Project, repository: Repository, issue: ProjectIssue) => {
      void goProject(project.id, {
        issueId: issue.id,
        repositoryId: repository.id,
      });
    },
    [goProject],
  );

  const handleOpenChannel = React.useCallback(
    (channelId: string) => {
      void goChannel(channelId);
    },
    [goChannel],
  );

  const handleOpenRepositoryBranch = React.useCallback(
    (project: Project, repository: Repository) => {
      void goProject(project.id, {
        repositoryId: repository.id,
        tab: "commits",
      });
    },
    [goProject],
  );

  const handleOpenRepositoryCommit = React.useCallback(
    (project: Project, repository: Repository, commitHash: string) => {
      void goProject(project.id, {
        commitHash,
        repositoryId: repository.id,
        tab: "commits",
      });
    },
    [goProject],
  );

  if (projectsQuery.isLoading) {
    return <ViewLoadingFallback kind="projects" />;
  }

  if (projectsQuery.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm text-red-400">Failed to load projects</p>
        <Button
          onClick={() => void projectsQuery.refetch()}
          size="sm"
          variant="outline"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (projectReadModels.length === 0) {
    return (
      <>
        <ProjectCreationDialog
          onOpenChange={setCreateProjectOpen}
          open={createProjectOpen}
        />
        <EmptyState onCreateProject={() => setCreateProjectOpen(true)} />
      </>
    );
  }

  return (
    <ProfilePanelProvider onOpenProfilePanel={handleOpenProfilePanel}>
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-row overflow-hidden",
        !isNarrowProjectsLayout && "bg-sidebar pb-2 pr-2 pt-px",
        !isNarrowProjectsLayout && sidebar?.open === false && "pl-2",
      )}
      data-project-context-detached={
        isNarrowProjectsLayout ? undefined : "true"
      }
      data-testid="projects-overview-layout"
    >
      <ProjectsWorkspaceChrome
        actions={null}
        onGoActivity={() => {}}
        section="Projects"
      />
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          !isNarrowProjectsLayout
            ? "ml-px rounded-2xl bg-background"
            : cn("rounded-tl-xl", topChromeInset.divider),
        )}
      >
        <ProjectCreationDialog
          onOpenChange={setCreateProjectOpen}
          open={createProjectOpen}
        />
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="relative min-h-0 min-w-0 flex-1">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-[3px] top-0 z-50 w-1 rounded-full bg-border/80 opacity-0 transition-opacity duration-200"
              ref={scrollIndicatorRef}
            />
            <div
              className="buzz-content-scrollbar h-full min-h-0 min-w-0 overflow-x-hidden overflow-y-scroll"
              onScroll={handleContentScroll}
            >
              <div className="px-4 pb-4">
                <div className="w-full space-y-3">
                  <div
                    className={cn(
                      "sticky top-0 z-30 -mx-4 flex h-13 min-w-0 items-center gap-1.5 overflow-hidden px-4",
                      PROJECT_COLUMN_HEADER_BACKDROP_CLASS,
                      isNarrowProjectsLayout
                        ? "rounded-tl-xl"
                        : "rounded-t-2xl",
                    )}
                    data-testid="projects-page-tabs"
                  >
                    <ProjectsSectionSearch
                      onCollapseAll={handleCollapseAll}
                      onExpandAll={handleExpandAll}
                      onQueryChange={setSearchQuery}
                      onSortChange={handleSortChange}
                      sort={sort}
                    />
                    <Button
                      aria-label="Create project"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                      data-testid="projects-overview-create-project"
                      onClick={() => setCreateProjectOpen(true)}
                      size="icon"
                      title="Create project"
                      type="button"
                      variant="ghost"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <ProjectsWorkItemsLoadNotice
                    error={projectsWorkItemsQuery.error}
                    failedSections={
                      projectsWorkItemsQuery.data?.issues.failedSections ?? []
                    }
                    isRetrying={
                      projectsWorkItemsQuery.isFetching &&
                      !projectsWorkItemsQuery.isLoading
                    }
                    onRetry={() => void projectsWorkItemsQuery.refetch()}
                    subject="issues"
                  />
                  {projectsWorkItemsQuery.isLoading ? (
                    <p className="px-2 text-xs text-muted-foreground">
                      Loading tasks
                    </p>
                  ) : null}
                  <ProjectsIndexTree
                    channelsById={channelsById}
                    channelsLoading={channelsQuery.isLoading}
                    collapsedProjectIds={collapsedProjectIds}
                    nodes={tree}
                    onOpenChannel={handleOpenChannel}
                    onToggleProject={handleToggleProject}
                    onOpenIssue={handleOpenIssue}
                    onOpenProject={handleOpenProject}
                    onOpenRepository={handleOpenRepository}
                    onOpenRepositoryBranch={handleOpenRepositoryBranch}
                    onOpenRepositoryCommit={handleOpenRepositoryCommit}
                    repositorySummaries={repositoryActivitySummariesQuery.data}
                    searching={searchQuery.trim().length > 0}
                  />
                </div>
              </div>
            </div>
          </div>
          {profilePanelPubkey ? (
            <UserProfilePanel
              canResetWidth={threadPanelWidth.canReset}
              currentPubkey={identityQuery.data?.pubkey}
              onClose={handleCloseProfilePanel}
              onOpenDm={handleOpenDm}
              onOpenProfile={handleOpenProfilePanel}
              onResetWidth={threadPanelWidth.onResetWidth}
              onResizeStart={threadPanelWidth.onResizeStart}
              onTabChange={handleProfilePanelTabChange}
              onViewChange={handleProfilePanelViewChange}
              pubkey={profilePanelPubkey}
              tab={profilePanelTab}
              view={profilePanelView}
              widthPx={threadPanelWidth.widthPx}
            />
          ) : (
            <ProjectsIndexActivity
              channelsById={channelsById}
              collapsed={activityCollapsed}
              issues={projectsWorkItemsQuery.data?.issues.items ?? []}
              onRetryWorkItems={() => void projectsWorkItemsQuery.refetch()}
              onToggleCollapsed={() =>
                setActivityCollapsed((collapsed) => !collapsed)
              }
              projects={projects}
              pullRequests={projectsWorkItemsQuery.data?.pullRequests.items ?? []}
              workItemsError={projectsWorkItemsQuery.error}
              workItemsFailedSections={[
                ...new Set([
                  ...(projectsWorkItemsQuery.data?.issues.failedSections ?? []),
                  ...(projectsWorkItemsQuery.data?.pullRequests.failedSections ??
                    []),
                ]),
              ]}
              workItemsLoading={projectsWorkItemsQuery.isLoading}
              workItemsRetrying={
                projectsWorkItemsQuery.isFetching &&
                !projectsWorkItemsQuery.isLoading
              }
            />
          )}
        </div>
      </div>
    </div>
    </ProfilePanelProvider>
  );
}
