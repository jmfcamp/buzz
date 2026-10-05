import { useQuery } from "@tanstack/react-query";
import {
  CircleDot,
  Files as FilesIcon,
  GitCommitHorizontal,
  Hash,
  Users,
} from "lucide-react";
import * as React from "react";

import {
  useProjectActivitySummariesQuery,
  useProjectsWorkItemsQuery,
  type Project,
  type ProjectLocalRepoSnapshot,
  type ProjectPullRequest,
  type ProjectRepoContributor,
  type ProjectRepoDiff,
  type ProjectRepoSnapshot,
  type Repository,
} from "@/features/projects/hooks";
import {
  gitContributorPubkeysFromCommits,
  type ProjectContributorActivityCounts,
  type ViewerGitIdentity,
} from "@/features/projects/lib/projectContributorMatching";
import { repositoryDiscussionQuery } from "@/features/projects/lib/discussionChannels";
import {
  hulaCommitByHash,
  hulaFilesRootPath,
  loadHulaCommit,
  loadHulaCommitDiff,
} from "@/features/projects/lib/hulaFiles";
import { openClawWorkspaceClient } from "@/features/projects/lib/openClawWorkspaceClient";
import type { ProjectRepoHost } from "@/features/projects/lib/projectRepoHost";
import { projectRepoUnavailableReason } from "@/features/projects/lib/projectRepoAvailability";
import { useReconcileProjectTaskList } from "@/features/projects/useReconcileProjectTaskList";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { BuzzLoadingState } from "@/shared/ui/BuzzLoadingState";
import { Tabs, TabsContent } from "@/shared/ui/tabs";
import { findReadmeFile } from "./ProjectReadmePanel";
import { RepositoryFilesPanel } from "./ProjectRepositoryPanel";
import type { RepositoryFileContentSource } from "./useRepositoryFileContent";
import type { RepoSourceHeaderControls } from "./ProjectRepositorySource";
import { DiscussionChannelsPanel } from "./DiscussionChannels";
import { ProjectCommitDetailPanel } from "./ProjectCommitDetailPanel";
import { ActivityPanel, ContributorsPanel } from "./ProjectDetailFeedPanels";
import { ProjectIssuesPanel } from "./ProjectIssuesPanel";
import { HulaProjectFiles } from "./HulaProjectFiles";
import { HulaProjectOverview } from "./HulaProjectOverview";
import {
  type GitDataState,
  ProjectOverviewPanel,
} from "./ProjectOverviewPanel";
import { ProjectTabsList } from "./ProjectWorkspaceTabList";
import { ProjectRepositoryUnavailableState } from "./ProjectRepositoryUnavailableState";
import {
  PROJECT_COLUMN_HEADER_BACKDROP_CLASS,
  PROJECT_DETAIL_PANEL_CLASS,
  PROJECT_SECTION_HEADER_CLASS,
} from "./projectPanelStyles";
import { ProjectSectionHeader } from "./ProjectSectionHeader";
import { ProjectPanelState } from "./ProjectPanelState";
import {
  CreateIssueDialog,
  type CreateIssueDialogInput,
} from "./CreateIssueDialog";

type CreateIssueAction = {
  onCreate: (input: CreateIssueDialogInput) => Promise<void>;
  pending: boolean;
};

function openWorkspaceTab(tab: string | undefined) {
  if (!tab || tab === "prs") return "overview";
  return tab;
}

export function WorkspaceTabs({
  commitDiff,
  commitDiffError,
  commitDiffLoading,
  contributorActivityCounts,
  contributorPubkeys,
  createIssueAction,
  createIssueRequestKey,
  initialTab,
  initialFilePath,
  initialTabRequestKey,
  fileContentSource,
  localSnapshot,
  localSnapshotError,
  localSnapshotLoading,
  project,
  projectId,
  selectedCommitHash,
  selectedIssueId,
  roundColumnHeader = false,
  sharedHeaderBackdrop,
  hideTabList = false,
  controlledTab,
  pullRequests,
  onSelectedCommitHashChange,
  onFilesContextChange,
  onSelectedIssueIdChange,
  onSelectedPullRequestIdChange,
  onSelectedTabChange,
  onBack,
  onSelectHulaRepository,
  gitRef,
  hulaProject,
  snapshot,
  snapshotError,
  snapshotLoading,
  profiles,
  repoContributors,
  repoSource,
  repoHost,
  sourceControls,
  viewerGitIdentity,
}: {
  commitDiff: ProjectRepoDiff | null | undefined;
  commitDiffError: unknown;
  commitDiffLoading: boolean;
  contributorActivityCounts: Record<string, ProjectContributorActivityCounts>;
  contributorPubkeys: string[];
  createIssueAction: CreateIssueAction;
  createIssueRequestKey?: number;
  /** Tab to open on mount (workspace vocabulary), e.g. from a share link. */
  initialTab?: string;
  /** File or folder to open when entering the repository Files tab. */
  initialFilePath?: string;
  /** Changes for every entity-link activation, including repeated links. */
  initialTabRequestKey?: string;
  fileContentSource?: RepositoryFileContentSource;
  localSnapshot: ProjectLocalRepoSnapshot | null | undefined;
  localSnapshotError: unknown;
  localSnapshotLoading: boolean;
  project: Repository;
  projectId: string;
  selectedCommitHash: string | null;
  selectedIssueId: string | null;
  /** Round the column header to the content pod's top corners. */
  roundColumnHeader?: boolean;
  sharedHeaderBackdrop?: boolean;
  pullRequests: ProjectPullRequest[];
  onSelectedCommitHashChange: (hash: string | null) => void;
  onFilesContextChange?: (context: {
    kind: "file" | "folder";
    path: string;
  }) => void;
  onSelectedIssueIdChange: (id: string | null) => void;
  onSelectedPullRequestIdChange: (id: string | null) => void;
  /** Reports the active tab so the screen breadcrumb can mirror it. */
  onSelectedTabChange?: (tab: string) => void;
  onBack: () => void;
  /**
   * Parent renders the section switcher (Chat, Read Me, …).
   * The workspace strip, including Back and Overview, stays hidden.
   */
  hideTabList?: boolean;
  /** Workspace-vocabulary tab owned by that parent switcher. */
  controlledTab?: string;
  /** Selects a member repository. Does not change the OpenClaw checkout. */
  onSelectHulaRepository?: (repositoryId: string) => void;
  /** OpenClaw ref for Files, commits, and contributors. `HEAD` is the checkout. */
  gitRef?: string;
  /** NIP-MP project, present when this workspace is a Hula path project. */
  hulaProject?: Project | null;
  snapshot: ProjectRepoSnapshot | null | undefined;
  snapshotError: unknown;
  snapshotLoading: boolean;
  profiles?: UserProfileLookup;
  repoContributors: ProjectRepoContributor[];
  repoSource: "remote" | "local";
  repoHost: ProjectRepoHost;
  /** Branch and source state used by repository content and recovery actions. */
  sourceControls?: RepoSourceHeaderControls;
  viewerGitIdentity?: ViewerGitIdentity | null;
}) {
  const hulaProjectScope = hulaProject?.hulaPath ? [hulaProject] : [];
  const hulaWorkItems = useProjectsWorkItemsQuery(hulaProjectScope);
  const hulaActivity = useProjectActivitySummariesQuery(hulaProjectScope);
  const taskListRefreshing = useReconcileProjectTaskList({
    issueCount: hulaProject
      ? hulaActivity.data?.[hulaProject.id]?.issueCount
      : undefined,
    loadedIssueCount: hulaProject?.hulaPath
      ? hulaWorkItems.data?.issues.items.length
      : undefined,
    refetch: hulaWorkItems.refetch,
  });
  const hulaFilesRoot = hulaProject?.hulaPath
    ? hulaFilesRootPath(hulaProject.hulaPath, project.hulaPath)
    : null;
  const [hulaSnapshot, setHulaSnapshot] = React.useState<{
    root: string;
    snapshot: ProjectRepoSnapshot | null;
  } | null>(null);
  const handleHulaSnapshot = React.useCallback(
    (next: ProjectRepoSnapshot | null) => {
      setHulaSnapshot(
        hulaFilesRoot ? { root: hulaFilesRoot, snapshot: next } : null,
      );
    },
    [hulaFilesRoot],
  );
  const currentHulaSnapshot =
    hulaSnapshot?.root === hulaFilesRoot ? hulaSnapshot.snapshot : null;
  const hulaCommitActive = Boolean(hulaFilesRoot && selectedCommitHash);
  const knownHulaCommit = hulaCommitActive
    ? hulaCommitByHash(currentHulaSnapshot, selectedCommitHash)
    : null;
  const hulaExec = React.useCallback(
    (argv: readonly string[], cwd: string) =>
      openClawWorkspaceClient.exec([...argv], cwd),
    [],
  );
  const hulaCommitQuery = useQuery({
    enabled: hulaCommitActive && !knownHulaCommit,
    queryKey: ["hula-commit", hulaFilesRoot, selectedCommitHash],
    queryFn: () =>
      hulaFilesRoot && selectedCommitHash
        ? loadHulaCommit(hulaFilesRoot, selectedCommitHash, hulaExec)
        : null,
  });
  const hulaDiffQuery = useQuery({
    enabled: hulaCommitActive,
    queryKey: ["hula-commit-diff", hulaFilesRoot, selectedCommitHash],
    queryFn: () =>
      hulaFilesRoot && selectedCommitHash
        ? loadHulaCommitDiff(hulaFilesRoot, selectedCommitHash, hulaExec)
        : null,
  });
  const localCheckoutSnapshot = localSnapshot?.snapshot ?? null;
  const displayedSnapshot =
    repoSource === "local" ? localCheckoutSnapshot : snapshot;
  const displayedSnapshotError =
    repoSource === "local" ? localSnapshotError : snapshotError;
  const displayedSnapshotLoading =
    repoSource === "local" ? localSnapshotLoading : snapshotLoading;
  const displayedContributors =
    displayedSnapshot?.contributors ?? repoContributors;
  const contributorPubkeysByGitIdentity = React.useMemo(
    () =>
      gitContributorPubkeysFromCommits(
        displayedSnapshot?.commits ?? [],
        pullRequests,
      ),
    [displayedSnapshot?.commits, pullRequests],
  );
  const files = displayedSnapshot?.files ?? [];
  const readmeFile = React.useMemo(() => findReadmeFile(files), [files]);
  const ownerProfile = profiles?.[normalizePubkey(project.owner)];
  const ownerName =
    ownerProfile?.displayName?.trim() ||
    ownerProfile?.nip05Handle?.trim() ||
    undefined;
  const externalHost =
    repoSource === "remote" && repoHost.kind === "external"
      ? repoHost.host
      : undefined;
  const gitDataState: GitDataState = displayedSnapshot
    ? files.length === 0
      ? "empty"
      : "available"
    : displayedSnapshotLoading
      ? "checking"
      : "unavailable";
  const unavailableReason =
    gitDataState === "unavailable" && !externalHost
      ? repoSource === "remote"
        ? (sourceControls?.remoteUnavailableReason ??
          projectRepoUnavailableReason(displayedSnapshotError))
        : displayedSnapshotError
          ? projectRepoUnavailableReason(displayedSnapshotError)
          : undefined
      : undefined;
  const repositoryUnavailableState =
    hulaFilesRoot || !(unavailableReason && !externalHost) ? null : (
      <ProjectRepositoryUnavailableState
        accessChannelId={project.channelId}
        onAskForAccess={sourceControls?.onAskForAccess}
        onRetry={sourceControls?.onFetch}
        ownerAvatarUrl={ownerProfile?.avatarUrl}
        ownerIsAgent={ownerProfile?.isAgent}
        ownerName={ownerName}
        reason={unavailableReason}
        retryPending={sourceControls?.fetchPending}
      />
    );
  const selectedCommitPullRequest = React.useMemo(
    () =>
      pullRequests.find(
        (pullRequest) =>
          pullRequest.commit === selectedCommitHash ||
          pullRequest.initialCommit === selectedCommitHash,
      ),
    [pullRequests, selectedCommitHash],
  );
  const isDetailSelected = Boolean(selectedIssueId || selectedCommitHash);
  const [uncontrolledTab, setUncontrolledTab] = React.useState(() =>
    openWorkspaceTab(initialTab),
  );
  const selectedTab = controlledTab
    ? openWorkspaceTab(controlledTab)
    : uncontrolledTab;
  // Follow later share-link navigations to the same project (the search
  // param changes without a remount).
  // biome-ignore lint/correctness/useExhaustiveDependencies: request key intentionally retriggers an unchanged tab.
  React.useEffect(() => {
    if (controlledTab) return;
    if (initialTab) setUncontrolledTab(openWorkspaceTab(initialTab));
  }, [controlledTab, initialTab, initialTabRequestKey]);
  const [createIssueOpen, setCreateIssueOpen] = React.useState(false);
  const previousCreateIssueRequestKey = React.useRef(createIssueRequestKey);

  React.useEffect(() => {
    if (previousCreateIssueRequestKey.current === createIssueRequestKey) return;
    previousCreateIssueRequestKey.current = createIssueRequestKey;
    setCreateIssueOpen(true);
  }, [createIssueRequestKey]);

  React.useEffect(() => {
    onSelectedTabChange?.(selectedTab);
  }, [onSelectedTabChange, selectedTab]);

  React.useEffect(() => {
    if (controlledTab || !selectedIssueId) return;
    setUncontrolledTab("issues");
  }, [controlledTab, selectedIssueId]);

  React.useEffect(() => {
    if (controlledTab || !selectedCommitHash) return;
    setUncontrolledTab("activity");
  }, [controlledTab, selectedCommitHash]);

  const handleTabChange = React.useCallback(
    (nextTab: string) => {
      setUncontrolledTab(openWorkspaceTab(nextTab));
      onSelectedPullRequestIdChange(null);
      if (nextTab !== "issues") {
        onSelectedIssueIdChange(null);
      }
      if (nextTab !== "activity") {
        onSelectedCommitHashChange(null);
      }
    },
    [
      onSelectedCommitHashChange,
      onSelectedIssueIdChange,
      onSelectedPullRequestIdChange,
    ],
  );
  const shownFileCount = hulaFilesRoot
    ? (currentHulaSnapshot?.files.length ?? 0)
    : files.length;
  const sectionHeader =
    selectedTab === "files" && shownFileCount > 0 ? (
      <ProjectSectionHeader
        className={PROJECT_SECTION_HEADER_CLASS}
        icon={FilesIcon}
        title="Files"
      />
    ) : selectedTab === "activity" && !selectedCommitHash ? (
      <ProjectSectionHeader
        className={PROJECT_SECTION_HEADER_CLASS}
        icon={GitCommitHorizontal}
        title="Commits"
      />
    ) : selectedTab === "issues" && !selectedIssueId ? (
      <ProjectSectionHeader
        action={{
          disabled: createIssueAction.pending,
          label: "Create task",
          onClick: () => setCreateIssueOpen(true),
        }}
        className={PROJECT_SECTION_HEADER_CLASS}
        icon={CircleDot}
        title="Tasks"
      />
    ) : selectedTab === "channels" ? (
      <ProjectSectionHeader
        className={PROJECT_SECTION_HEADER_CLASS}
        icon={Hash}
        title="Channels"
      />
    ) : selectedTab === "contributors" ? (
      <ProjectSectionHeader
        className={PROJECT_SECTION_HEADER_CLASS}
        icon={Users}
        title="Contributors"
      />
    ) : null;

  return (
    <Tabs
      className="flex min-w-0 flex-1 flex-col space-y-3"
      onValueChange={handleTabChange}
      value={selectedTab}
    >
      {!hideTabList && !isDetailSelected ? (
        <div
          className={`sticky top-0 z-30 -mx-4 flex h-13 min-w-0 items-center gap-1 overflow-hidden px-4 ${
            roundColumnHeader ? "rounded-t-2xl" : ""
          } ${sharedHeaderBackdrop ? "" : PROJECT_COLUMN_HEADER_BACKDROP_CLASS}`}
          data-testid="project-workspace-tab-menu"
        >
          <ProjectTabsList onBack={onBack} />
        </div>
      ) : null}
      {/* Project content follows the same borderless flow as work-item details.
          Inner panels retain standalone chrome, neutralized here. */}
      <div
        className="-mx-4 flex flex-1 flex-col [&_[data-project-detail-panel]]:rounded-none [&_[data-project-detail-panel]]:border-0"
        data-testid="project-workspace-panel"
      >
        {sectionHeader}

        <TabsContent
          className="m-0 min-h-0 flex-1 flex-col data-[state=active]:flex"
          value="overview"
        >
          {hulaProject?.hulaPath ? (
            <HulaProjectOverview
              onSelectRepository={(repositoryId) => {
                onSelectHulaRepository?.(repositoryId);
              }}
              project={hulaProject}
            >
              <ProjectOverviewPanel
                accessChannelId={project.channelId}
                externalHost={externalHost}
                externalUrl={externalHost ? sourceControls?.externalUrl : null}
                fileContentSource={fileContentSource}
                gitDataState={gitDataState}
                hideReadmeHeader
                ownerAvatarUrl={ownerProfile?.avatarUrl}
                ownerIsAgent={ownerProfile?.isAgent}
                ownerName={ownerName}
                readmeFile={readmeFile}
                sourceControls={sourceControls}
                unavailableReason={unavailableReason}
              />
            </HulaProjectOverview>
          ) : (
            <ProjectOverviewPanel
              accessChannelId={project.channelId}
              externalHost={externalHost}
              externalUrl={externalHost ? sourceControls?.externalUrl : null}
              fileContentSource={fileContentSource}
              gitDataState={gitDataState}
              hideReadmeHeader
              ownerAvatarUrl={ownerProfile?.avatarUrl}
              ownerIsAgent={ownerProfile?.isAgent}
              ownerName={ownerName}
              readmeFile={readmeFile}
              sourceControls={sourceControls}
              unavailableReason={unavailableReason}
            />
          )}
        </TabsContent>

        <TabsContent
          className="m-0 min-h-0 flex-1 flex-col data-[state=active]:flex"
          value="activity"
        >
          {repositoryUnavailableState ??
            (selectedCommitHash ? (
              <ProjectCommitDetailPanel
                commit={
                  hulaCommitActive
                    ? (knownHulaCommit ?? hulaCommitQuery.data ?? null)
                    : (displayedSnapshot?.commits.find(
                        (commit) => commit.hash === selectedCommitHash,
                      ) ?? null)
                }
                commitHash={selectedCommitHash}
                diff={hulaCommitActive ? hulaDiffQuery.data : commitDiff}
                diffError={
                  hulaCommitActive ? hulaDiffQuery.error : commitDiffError
                }
                diffLoading={
                  hulaCommitActive ? hulaDiffQuery.isPending : commitDiffLoading
                }
                originAgentName={selectedCommitPullRequest?.originAgentName}
                originChannelId={selectedCommitPullRequest?.channelId}
                project={project}
              />
            ) : (
              <ActivityPanel
                branch={sourceControls?.branch}
                error={displayedSnapshotError}
                isLoading={displayedSnapshotLoading}
                onSelectCommit={(commit) =>
                  onSelectedCommitHashChange(commit.hash)
                }
                profiles={profiles}
                project={project}
                projectId={projectId}
                pullRequests={pullRequests}
                repoContributors={displayedContributors}
                snapshot={displayedSnapshot}
                viewerGitIdentity={viewerGitIdentity}
              />
            ))}
        </TabsContent>

        <TabsContent
          className={`m-0 ${selectedIssueId ? "" : PROJECT_DETAIL_PANEL_CLASS}`}
          data-project-detail-panel
          value="issues"
        >
          <ProjectIssuesPanel
            error={hulaProject?.hulaPath ? hulaWorkItems.error : undefined}
            isLoading={
              hulaProject?.hulaPath
                ? hulaWorkItems.isLoading ||
                  taskListRefreshing ||
                  (hulaWorkItems.isFetching &&
                    (hulaWorkItems.data?.issues.items.length ?? 0) === 0 &&
                    hulaWorkItems.error == null)
                : undefined
            }
            issueItems={
              hulaProject?.hulaPath
                ? (hulaWorkItems.data?.issues.items ?? []).map(
                    ({ issue, repository }) => ({
                      issue,
                      project: repository,
                    }),
                  )
                : undefined
            }
            onSelectedIssueIdChange={onSelectedIssueIdChange}
            profiles={profiles}
            project={project}
            repositories={
              hulaProject?.hulaPath ? hulaProject.repositories : undefined
            }
            selectedIssueId={selectedIssueId}
          />
        </TabsContent>

        <TabsContent className="m-0" value="files">
          {hulaFilesRoot ? (
            <HulaProjectFiles
              fallbackAuthorPubkey={project.owner}
              gitRef={gitRef}
              initialPath={initialFilePath}
              onContextChange={onFilesContextChange}
              onOpenCommit={onSelectedCommitHashChange}
              onSnapshot={handleHulaSnapshot}
              profiles={profiles}
              rootPath={hulaFilesRoot}
            />
          ) : (
            (repositoryUnavailableState ??
            (repoSource === "local" &&
            !localSnapshot &&
            !localSnapshotLoading ? (
              <ProjectPanelState
                description="Switch to the remote source or clone this repository locally."
                title="No local checkout found"
              />
            ) : (
              <RepositoryFilesPanel
                error={displayedSnapshotError}
                fallbackAuthorPubkey={project.owner}
                fileContentSource={fileContentSource}
                files={files}
                initialPath={initialFilePath}
                isLoading={displayedSnapshotLoading}
                onContextChange={onFilesContextChange}
                onOpenCommit={onSelectedCommitHashChange}
                profiles={profiles}
                snapshot={displayedSnapshot}
                unavailableMessage={
                  externalHost
                    ? `Not mirrored on Buzz. Repository files are hosted on ${externalHost}.`
                    : undefined
                }
              />
            )))
          )}
        </TabsContent>

        <TabsContent className="m-0" value="channels">
          <DiscussionChannelsPanel
            query={repositoryDiscussionQuery(project)}
            repositoryName={project.name}
          />
        </TabsContent>

        <TabsContent className="m-0" value="contributors">
          {displayedSnapshotLoading ? (
            <BuzzLoadingState label="Loading contributors" />
          ) : (
            <ContributorsPanel
              activityCounts={contributorActivityCounts}
              contributorPubkeys={contributorPubkeys}
              contributorPubkeysByGitIdentity={contributorPubkeysByGitIdentity}
              profiles={profiles}
              repoContributors={displayedContributors}
            />
          )}
        </TabsContent>
      </div>
      <CreateIssueDialog
        isCreating={createIssueAction.pending}
        onCreate={createIssueAction.onCreate}
        onOpenChange={setCreateIssueOpen}
        open={createIssueOpen}
        projectName={project.name}
      />
    </Tabs>
  );
}
