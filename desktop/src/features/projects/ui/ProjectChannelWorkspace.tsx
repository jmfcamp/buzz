import { toast } from "sonner";
import * as React from "react";

import { useCommunities } from "@/features/communities/useCommunities";
import {
  useProjectIssuesQuery,
  useProjectPullRequestsQuery,
  useRepoStateQuery,
  type Project,
} from "@/features/projects/hooks";
import { resolveProjectDefaultBranch } from "@/features/projects/lib/projectBranches";
import { hulaFilesRootPath } from "@/features/projects/lib/hulaFiles";
import { selectProjectRepository } from "@/features/projects/projectModels";
import { useCreateProjectIssueMutation } from "@/features/projects/issueMutations";
import { useOptimisticProjectBranches } from "@/features/projects/useOptimisticProjectBranches";
import { useProjectRepositoryRefSelection } from "@/features/projects/useProjectRepositoryRefSelection";
import { useProjectRepoPresentation } from "@/features/projects/useProjectRepoHost";
import {
  useHulaFilesSnapshot,
  useHulaRepositoryRefs,
} from "@/features/projects/useHulaRepositoryGit";
import { WorkspaceTabs } from "./ProjectWorkspaceTabs";
import {
  openClawRepoSourceControls,
  type RepoSourceHeaderControls,
} from "./ProjectRepositorySource";
import type { CreateIssueDialogInput } from "./CreateIssueDialog";
import { useProjectDetailPeople } from "./useProjectDetailPeople";
import { useRepositoryFileContentSource } from "./useRepositoryFileContentSource";
import { useProjectDetailGitViews } from "./useRetainedProjectGitViews";
import { snapshotHasContent } from "./projectDetailHelpers";

/**
 * Repository sections embedded in the project channel column.
 * Reuses WorkspaceTabs and the same git snapshot hooks as the full workspace.
 * The channel home keeps its own rail; this pane has no repository side panel.
 */
export function ProjectChannelWorkspace({
  onSectionChange,
  onSelectRepository,
  project,
  repositoryId,
  section,
}: {
  onSectionChange: (section: string) => void;
  onSelectRepository: (repositoryId: string) => void;
  project: Project;
  repositoryId: string | null;
  section: string;
}) {
  const { activeCommunity } = useCommunities();
  const repository = selectProjectRepository(project, repositoryId);
  const repoRemote = useProjectRepoPresentation(repository);
  const relayGit = !repository?.hulaPath;
  const hulaRoot = hulaFilesRootPath(project.hulaPath, repository?.hulaPath);
  const hulaRefs = useHulaRepositoryRefs(hulaRoot);
  const repoStateQuery = useRepoStateQuery(repository, relayGit);
  const pullRequestsQuery = useProjectPullRequestsQuery(repository);
  const issuesQuery = useProjectIssuesQuery(repository);
  const defaultBranch = hulaRoot
    ? (hulaRefs.headBranch ?? hulaRefs.branches[0] ?? null)
    : repository
      ? resolveProjectDefaultBranch(
          repository.defaultBranch,
          repoStateQuery.data,
        )
      : null;
  const observedBranches = hulaRoot
    ? hulaRefs.branches.map((name) => ({ name, commit: "" }))
    : (repoStateQuery.data?.branches ?? []);
  const { branchOptions } = useOptimisticProjectBranches({
    defaultBranch,
    observedBranches,
    projectId: repository?.id ?? project.id,
    referencedBranches:
      pullRequestsQuery.data?.map(
        (pullRequest) => pullRequest.branchName ?? null,
      ) ?? [],
  });
  const { activeBranch, selectBranch, selectedTag, selectTag } =
    useProjectRepositoryRefSelection({
      branchOptions,
      defaultBranch,
      projectAvailable: Boolean(repository),
      projectPending: false,
      repositoryId: repository?.id ?? null,
      tags: hulaRoot ? [] : (repoStateQuery.data?.tags ?? []),
    });
  const activeTag =
    repoStateQuery.data?.tags.find((tag) => tag.name === selectedTag) ?? null;
  const [repoSource, setRepoSource] = React.useState<"remote" | "local">(
    "remote",
  );
  const [selectedCommitHash, setSelectedCommitHash] = React.useState<
    string | null
  >(null);
  const [selectedIssueId, setSelectedIssueId] = React.useState<string | null>(
    null,
  );
  const {
    commitDiffQuery,
    displayedRepoSnapshot,
    localRepoSnapshotQuery,
    repoSnapshotQuery,
  } = useProjectDetailGitViews({
    activeBranch,
    activeRepoPullRequest: null,
    activeTag,
    isBuzzHost: repoRemote.host.kind === "buzz",
    relayGit,
    repository,
    reposDir: activeCommunity?.reposDir,
    repoSource: hulaRoot ? "remote" : repoSource,
    selectedBranchPullRequest: null,
    selectedCommitHash,
    selectedTag,
  });
  const hasLocalCheckout = Boolean(localRepoSnapshotQuery.data);
  React.useEffect(() => {
    if (hulaRoot) {
      if (repoSource !== "remote") setRepoSource("remote");
      return;
    }
    if (
      repoSource === "remote" &&
      !snapshotHasContent(displayedRepoSnapshot) &&
      hasLocalCheckout
    ) {
      setRepoSource("local");
    }
  }, [displayedRepoSnapshot, hasLocalCheckout, hulaRoot, repoSource]);
  React.useEffect(() => {
    if (section !== "issues") setSelectedIssueId(null);
    if (section !== "activity") setSelectedCommitHash(null);
  }, [section]);
  const {
    contributorActivityCounts,
    contributorPubkeys,
    profiles,
    viewerGitIdentity,
  } = useProjectDetailPeople({
    issues: issuesQuery.data ?? [],
    pullRequests: pullRequestsQuery.data ?? [],
    repository,
  });
  const createIssueMutation = useCreateProjectIssueMutation(repository);
  const fileContentSource = useRepositoryFileContentSource({
    activeBranch,
    activeTag,
    pullRequest: null,
    repository,
    reposDir: activeCommunity?.reposDir,
    selectedTag,
    source: repoSource,
  });
  const hulaGitRef = activeBranch?.trim() || "HEAD";
  const hulaSnapshotQuery = useHulaFilesSnapshot(hulaRoot, hulaGitRef);
  const handleFetch = React.useCallback(() => {
    if (hulaRoot) {
      void hulaSnapshotQuery.refetch();
      void hulaRefs.refetch();
      return;
    }
    void repoSnapshotQuery.refetch();
    void repoStateQuery.refetch();
  }, [
    hulaRefs,
    hulaRoot,
    hulaSnapshotQuery,
    repoSnapshotQuery,
    repoStateQuery,
  ]);
  const sourceControls: RepoSourceHeaderControls = {
    branch: activeBranch ?? "",
    branchOptions,
    selectedTag,
    tagOptions: repoStateQuery.data?.tags ?? [],
    onBranchChange: selectBranch,
    onTagChange: selectTag,
    source: hulaRoot || selectedTag ? "remote" : repoSource,
    onSourceChange: setRepoSource,
    localDisabled: Boolean(hulaRoot || selectedTag) || !hasLocalCheckout,
    localLabel: hasLocalCheckout ? "Local" : "Local missing",
    localPath: localRepoSnapshotQuery.data?.path,
    ...repoRemote.controls,
    onFetch: handleFetch,
    fetchPending: hulaRoot
      ? hulaSnapshotQuery.isFetching || hulaRefs.isFetching
      : repoSnapshotQuery.isFetching || repoStateQuery.isFetching,
    fetchTitle: hulaRoot
      ? "Read the OpenClaw checkout again"
      : "Check for remote changes",
  };
  const shownSourceControls = hulaRoot
    ? openClawRepoSourceControls(sourceControls, {
        checkedOutBranch: hulaRefs.headBranch,
        onFetch: handleFetch,
        pending: hulaSnapshotQuery.isFetching || hulaRefs.isFetching,
      })
    : sourceControls;
  const handleCreateIssue = React.useCallback(
    async (input: CreateIssueDialogInput) => {
      const issueId = await createIssueMutation.mutateAsync(input);
      toast.success("Task created.");
      await issuesQuery.refetch();
      setSelectedIssueId(issueId);
      onSectionChange("issues");
    },
    [createIssueMutation, issuesQuery, onSectionChange],
  );
  const openClawSnapshot = hulaRoot ? (hulaSnapshotQuery.data ?? null) : null;

  if (!repository) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
        <p className="text-sm text-muted-foreground">
          This project has no repository yet.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-none px-4 pb-4"
      data-testid="project-detail-scroll"
    >
      <div className="flex min-h-full w-full flex-col space-y-3">
        <WorkspaceTabs
          key={`${project.id}:${repository.id}`}
          controlledTab={section}
          hideTabList
          commitDiff={commitDiffQuery.data}
          commitDiffError={commitDiffQuery.error}
          commitDiffLoading={commitDiffQuery.isLoading}
          contributorActivityCounts={contributorActivityCounts}
          contributorPubkeys={contributorPubkeys}
          createIssueAction={{
            onCreate: handleCreateIssue,
            pending: createIssueMutation.isPending,
          }}
          fileContentSource={hulaRoot ? undefined : fileContentSource}
          gitRef={hulaRoot ? hulaGitRef : undefined}
          hulaProject={project}
          localSnapshot={localRepoSnapshotQuery.data}
          localSnapshotError={localRepoSnapshotQuery.error}
          localSnapshotLoading={localRepoSnapshotQuery.isLoading}
          onBack={() => onSectionChange("chat")}
          onSelectHulaRepository={onSelectRepository}
          onSelectedCommitHashChange={(hash) => {
            setSelectedCommitHash(hash);
            if (hash) onSectionChange("activity");
          }}
          onSelectedIssueIdChange={(id) => {
            setSelectedIssueId(id);
            if (id) onSectionChange("issues");
          }}
          onSelectedPullRequestIdChange={() => undefined}
          profiles={profiles}
          project={repository}
          projectId={project.id}
          pullRequests={pullRequestsQuery.data ?? []}
          repoContributors={
            hulaRoot
              ? (openClawSnapshot?.contributors ?? [])
              : (displayedRepoSnapshot?.contributors ?? [])
          }
          repoHost={repoRemote.host}
          repoSource={hulaRoot ? "remote" : repoSource}
          selectedCommitHash={selectedCommitHash}
          selectedIssueId={selectedIssueId}
          snapshot={hulaRoot ? openClawSnapshot : displayedRepoSnapshot}
          snapshotError={
            hulaRoot ? hulaSnapshotQuery.error : repoSnapshotQuery.error
          }
          snapshotLoading={
            hulaRoot
              ? hulaSnapshotQuery.isPending
              : repoSnapshotQuery.isLoading && !displayedRepoSnapshot
          }
          sourceControls={shownSourceControls}
          viewerGitIdentity={viewerGitIdentity}
        />
      </div>
    </div>
  );
}
