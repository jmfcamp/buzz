import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useCommunities } from "@/features/communities/useCommunities";
import {
  useProjectActivitySummariesQuery,
  useProjectPullRequestsQuery,
  useProjectRepoSnapshotQuery,
  useProjectsWorkItemsQuery,
  useRepoStateQuery,
  type Project,
} from "@/features/projects/hooks";
import { hulaCommitByHash } from "@/features/projects/lib/hulaFiles";
import { gitContributorPubkeysFromCommits } from "@/features/projects/lib/projectContributorMatching";
import { resolveProjectDefaultBranch } from "@/features/projects/lib/projectBranches";
import type { ProjectHomeWorkspaceSheetTab } from "@/features/projects/lib/projectHomeWorkspaceSheet";
import { useProjectCommitDiffQuery } from "@/features/projects/useProjectCommitDiff";
import { useReconcileProjectTaskList } from "@/features/projects/useReconcileProjectTaskList";
import { useProjectRepositorySnapshots } from "@/features/projects/useProjectRepositorySnapshots";
import {
  useHulaCommitDetail,
  useHulaFilesSnapshot,
  useHulaRepositorySnapshots,
} from "@/features/projects/useHulaRepositoryGit";
import { CreateProjectIssueDialog } from "./CreateProjectIssueDialog";
import { ProjectCommitDetailPanel } from "./ProjectCommitDetailPanel";
import { ContributorsPanel } from "./ProjectDetailFeedPanels";
import { ProjectHomeCodebasePanel } from "./ProjectHomeCodebasePanel";
import { ProjectHomeCommitsPanel } from "./ProjectHomeCommitsPanel";
import { ProjectIssuesPanel } from "./ProjectIssuesPanel";
import { PROJECT_DETAIL_PANEL_CLASS } from "./projectPanelStyles";
import { useProjectDetailPeople } from "./useProjectDetailPeople";

export type ProjectHomeWorkspaceCreateAction = {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  title?: string;
};

export type ProjectHomeWorkspaceDetail = {
  backLabel: string;
  navigation: {
    commitHash?: string;
    filePath?: string;
    issueId?: string;
    pullRequestId?: string;
    repositoryId?: string;
  };
  onBack: () => void;
};

export function ProjectHomeWorkspaceSheet({
  identityPubkey,
  onCreateActionChange,
  onDetailChange,
  onOpenCommit,
  onRepositoryAdded,
  onSelectRepository,
  project,
  projects,
  repository,
  tab,
}: {
  identityPubkey?: string;
  onCreateActionChange?: (
    action: ProjectHomeWorkspaceCreateAction | null,
  ) => void;
  onDetailChange?: (detail: ProjectHomeWorkspaceDetail | null) => void;
  onOpenCommit: (commitHash: string) => void;
  onRepositoryAdded: (repositoryId: string) => void;
  onSelectRepository: (repositoryId: string) => void;
  project: Project;
  projects: Project[];
  repository: Project["repositories"][number];
  tab: ProjectHomeWorkspaceSheetTab;
}) {
  const { goProject } = useAppNavigation();
  const { activeCommunity } = useCommunities();
  const [selectedIssueId, setSelectedIssueId] = React.useState<string | null>(
    null,
  );
  const [selectedCommitHash, setSelectedCommitHash] = React.useState<
    string | null
  >(null);
  const [selectedCommitRepositoryId, setSelectedCommitRepositoryId] =
    React.useState<string | null>(null);
  const [filesContext, setFilesContext] = React.useState<{
    kind: "file" | "folder";
    onBack?: () => void;
    path: string;
  } | null>(null);
  const [createIssueOpen, setCreateIssueOpen] = React.useState(false);

  const projectScope = React.useMemo(() => [project], [project]);
  const workItemsQuery = useProjectsWorkItemsQuery(projectScope);
  const activityQuery = useProjectActivitySummariesQuery(projectScope);
  const taskListRefreshing = useReconcileProjectTaskList({
    issueCount: activityQuery.data?.[project.id]?.issueCount,
    loadedIssueCount: workItemsQuery.data?.issues.items.length,
    refetch: workItemsQuery.refetch,
  });
  const pullRequestsQuery = useProjectPullRequestsQuery(repository);
  const issueItems = React.useMemo(
    () =>
      (workItemsQuery.data?.issues.items ?? []).map(
        ({ issue, repository: issueRepository }) => ({
          issue,
          project: issueRepository,
        }),
      ),
    [workItemsQuery.data?.issues.items],
  );
  const issues = React.useMemo(
    () => issueItems.map(({ issue }) => issue),
    [issueItems],
  );
  const pullRequests = pullRequestsQuery.data ?? [];
  const people = useProjectDetailPeople({
    issues,
    pullRequests,
    repository,
  });
  const hulaProject = Boolean(project.hulaPath);
  const hulaRoot = hulaProject ? (repository.hulaPath ?? null) : null;
  const repoStateQuery = useRepoStateQuery(repository, !hulaProject);
  const defaultBranch = resolveProjectDefaultBranch(
    repository.defaultBranch,
    repoStateQuery.data,
  );
  const snapshotQuery = useProjectRepoSnapshotQuery(
    repository,
    defaultBranch,
    null,
    null,
    !hulaProject,
  );
  const hulaSnapshotQuery = useHulaFilesSnapshot(hulaRoot, "HEAD");
  const snapshot = hulaProject
    ? (hulaSnapshotQuery.data ?? null)
    : (snapshotQuery.data ?? null);
  const relaySnapshots = useProjectRepositorySnapshots(
    project.repositories,
    tab === "commits" && !hulaProject,
  );
  const hulaSnapshots = useHulaRepositorySnapshots(
    project.repositories,
    tab === "commits" && hulaProject,
  );
  const repositorySnapshots = hulaProject ? hulaSnapshots : relaySnapshots;
  const selectedCommitResult =
    repositorySnapshots.find(
      ({ repository: candidate }) =>
        candidate.id === selectedCommitRepositoryId,
    ) ?? null;
  const selectedCommitRepository =
    selectedCommitResult?.repository ?? repository;
  const hulaCommitRoot = hulaProject
    ? (selectedCommitRepository.hulaPath ?? null)
    : null;
  const hulaCommit = useHulaCommitDetail(hulaCommitRoot, selectedCommitHash);
  const commitDiffQuery = useProjectCommitDiffQuery(
    selectedCommitRepository,
    selectedCommitHash,
    "remote",
    activeCommunity?.reposDir,
    !hulaCommitRoot,
  );
  const contributorPubkeysByGitIdentity = React.useMemo(
    () =>
      gitContributorPubkeysFromCommits(snapshot?.commits ?? [], pullRequests),
    [pullRequests, snapshot?.commits],
  );
  const selectedIssueItem =
    issueItems.find(({ issue }) => issue.id === selectedIssueId) ?? null;
  const selectedCommit = hulaCommitRoot
    ? (hulaCommitByHash(
        selectedCommitResult?.snapshot ?? snapshot,
        selectedCommitHash,
      ) ??
      hulaCommit.commitQuery.data ??
      null)
    : (selectedCommitResult?.snapshot?.commits.find(
        (commit) => commit.hash === selectedCommitHash,
      ) ??
      snapshot?.commits.find((commit) => commit.hash === selectedCommitHash) ??
      null);
  const selectedCommitPullRequest = selectedCommitHash
    ? selectedCommitRepository.id === repository.id
      ? pullRequests.find(
          (pullRequest) =>
            pullRequest.commit === selectedCommitHash ||
            pullRequest.initialCommit === selectedCommitHash,
        )
      : null
    : null;
  const handleIssueCreated = React.useCallback(
    async (
      createdProject: Project,
      _createdRepository: Project["repositories"][number],
      issueId: string,
    ) => {
      if (createdProject.id !== project.id) {
        await goProject(createdProject.id, { issueId });
        return;
      }
      await workItemsQuery.refetch();
      setSelectedIssueId(issueId);
    },
    [goProject, project.id, workItemsQuery],
  );
  const detail = React.useMemo<ProjectHomeWorkspaceDetail | null>(() => {
    if (tab === "issues" && selectedIssueId) {
      return {
        backLabel: "Back to Tasks",
        navigation: {
          issueId: selectedIssueId,
          repositoryId: selectedIssueItem?.project.id,
        },
        onBack: () => setSelectedIssueId(null),
      };
    }
    if (tab === "commits" && selectedCommitHash) {
      return {
        backLabel: "Back to Commits",
        navigation: {
          commitHash: selectedCommitHash,
          repositoryId: selectedCommitRepository.id,
        },
        onBack: () => {
          setSelectedCommitHash(null);
          setSelectedCommitRepositoryId(null);
        },
      };
    }
    if (tab === "files" && filesContext?.onBack) {
      return {
        backLabel: "Back to Files",
        navigation: { filePath: filesContext.path },
        onBack: filesContext.onBack,
      };
    }
    return null;
  }, [
    filesContext,
    selectedCommitHash,
    selectedCommitRepository.id,
    selectedIssueId,
    selectedIssueItem?.project.id,
    tab,
  ]);
  React.useEffect(() => {
    onDetailChange?.(detail);
  }, [detail, onDetailChange]);
  React.useEffect(
    () => () => {
      onDetailChange?.(null);
    },
    [onDetailChange],
  );
  React.useEffect(() => {
    if (tab === "issues" && !selectedIssueId) {
      onCreateActionChange?.({
        disabled: project.repositories.length === 0,
        label: "Create task",
        onClick: () => setCreateIssueOpen(true),
      });
      return;
    }
    onCreateActionChange?.(null);
  }, [onCreateActionChange, project.repositories.length, selectedIssueId, tab]);
  React.useEffect(
    () => () => {
      onCreateActionChange?.(null);
    },
    [onCreateActionChange],
  );

  let body: React.ReactNode;
  switch (tab) {
    case "issues":
      body = (
        <ProjectIssuesPanel
          error={workItemsQuery.error}
          isLoading={
            workItemsQuery.isLoading ||
            taskListRefreshing ||
            (workItemsQuery.isFetching &&
              issueItems.length === 0 &&
              workItemsQuery.error == null)
          }
          issueItems={issueItems}
          onSelectedIssueIdChange={setSelectedIssueId}
          profiles={people.profiles}
          project={selectedCommitRepository}
          selectedIssueId={selectedIssueId}
        />
      );
      break;
    case "commits":
      body = selectedCommitHash ? (
        <ProjectCommitDetailPanel
          commit={selectedCommit}
          commitHash={selectedCommitHash}
          diff={
            hulaCommitRoot ? hulaCommit.diffQuery.data : commitDiffQuery.data
          }
          diffError={
            hulaCommitRoot ? hulaCommit.diffQuery.error : commitDiffQuery.error
          }
          diffLoading={
            hulaCommitRoot
              ? hulaCommit.diffQuery.isPending
              : commitDiffQuery.isLoading
          }
          originAgentName={selectedCommitPullRequest?.originAgentName}
          originChannelId={selectedCommitPullRequest?.channelId}
          project={selectedCommitRepository}
        />
      ) : (
        <ProjectHomeCommitsPanel
          onSelectCommit={(commit, commitRepository) => {
            setSelectedCommitRepositoryId(commitRepository.id);
            setSelectedCommitHash(commit.hash);
          }}
          profiles={people.profiles}
          projectId={project.id}
          pullRequests={pullRequests}
          results={repositorySnapshots}
          viewerGitIdentity={people.viewerGitIdentity}
        />
      );
      break;
    case "files":
      body = (
        <ProjectHomeCodebasePanel
          identityPubkey={identityPubkey}
          onFilesContextChange={setFilesContext}
          onOpenCommit={onOpenCommit}
          onRepositoryAdded={onRepositoryAdded}
          onSelectRepository={onSelectRepository}
          profiles={people.profiles}
          project={project}
          projects={projects}
          repository={repository}
        />
      );
      break;
    case "contributors":
      body = (
        <ContributorsPanel
          activityCounts={people.contributorActivityCounts}
          contributorPubkeys={people.contributorPubkeys}
          contributorPubkeysByGitIdentity={contributorPubkeysByGitIdentity}
          profiles={people.profiles}
          repoContributors={snapshot?.contributors ?? []}
        />
      );
      break;
  }

  const listPanel = tab === "issues" && !selectedIssueId;

  return (
    <div
      className="-mx-4 [&_[data-project-detail-panel]]:rounded-none [&_[data-project-detail-panel]]:border-0"
      data-tab={tab}
      data-testid="project-home-workspace-sheet"
    >
      {listPanel ? (
        <div className={PROJECT_DETAIL_PANEL_CLASS} data-project-detail-panel>
          {body}
        </div>
      ) : (
        body
      )}
      <CreateProjectIssueDialog
        initialProjectId={project.id}
        onCreated={handleIssueCreated}
        onOpenChange={setCreateIssueOpen}
        open={createIssueOpen}
        projects={projectScope}
      />
    </div>
  );
}
