import {
  commitAuthorPubkeysFromPullRequests,
  profileForCommit,
  type ViewerGitIdentity,
} from "@/features/projects/lib/projectContributorMatching";
import {
  COMMIT_HISTORY_ALL,
  type CommitHistoryScope,
} from "@/features/projects/lib/projectCommitFilters";
import type {
  ProjectPullRequest,
  ProjectRepoContributor,
  Repository,
} from "@/features/projects/hooks";
import { selectionItemFromCommit } from "@/features/projects/lib/projectSelection";
import { commitShareLink } from "@/features/projects/lib/projectShareLinks";
import { relativeTime } from "@/features/projects/lib/projectsViewHelpers";
import { useHulaAllCommitLists } from "@/features/projects/useHulaRepositoryGit";
import type { ProjectRepoCommit } from "@/shared/api/types";
import * as React from "react";
import {
  resolveUserLabel,
  type UserProfileLookup,
} from "@/features/profile/lib/identity";
import { VirtualizedList } from "@/shared/ui/VirtualizedList";
import { FolderGit2, GitBranch, GitCommitHorizontal } from "lucide-react";

import { CopyCommitHashButton } from "./ProjectCommitCopyButton";
import { ProjectCommitBrowser } from "./ProjectCommitBrowser";
import { ProfileIdentityButton } from "./ProjectProfileIdentity";
import { ProjectWorkItemRow } from "./ProjectWorkItemRow";

/** Plain rows stay easier to scan. Longer lists paint a window. */
const VIRTUALIZE_AFTER = 80;

export type CommitFeedItem = {
  branch?: string;
  commit: ProjectRepoCommit;
  project: Repository;
  projectId: string;
  pullRequests?: ProjectPullRequest[];
  repoContributors?: ProjectRepoContributor[];
};

function commitSelectionItem(
  commit: ProjectRepoCommit,
  repository: Repository,
  projectId: string,
  author?: string | null,
) {
  return selectionItemFromCommit({
    author,
    channelId: repository.channelId,
    commitHash: commit.hash,
    projectId,
    shareLink: commitShareLink(repository, commit.hash),
    title: commit.subject,
  });
}

function CommitRows({
  items,
  onSelectCommit,
  profiles,
  showRepositoryName,
  viewerGitIdentity,
}: {
  items: readonly CommitFeedItem[];
  onSelectCommit?: (commit: ProjectRepoCommit, project: Repository) => void;
  profiles?: UserProfileLookup;
  showRepositoryName: boolean;
  viewerGitIdentity?: ViewerGitIdentity | null;
}) {
  const rangeItems = items.map((item) => {
    const matchedProfile = profileForCommit(
      item.commit,
      profiles,
      commitAuthorPubkeysFromPullRequests(item.pullRequests ?? []),
      viewerGitIdentity,
    );
    return commitSelectionItem(
      item.commit,
      item.project,
      item.projectId,
      matchedProfile?.pubkey,
    );
  });
  const renderItem = (item: CommitFeedItem) => {
    const commitAuthorPubkeys = commitAuthorPubkeysFromPullRequests(
      item.pullRequests ?? [],
    );
    const matchedProfile = profileForCommit(
      item.commit,
      profiles,
      commitAuthorPubkeys,
      viewerGitIdentity,
    );
    const authorLabel = matchedProfile
      ? resolveUserLabel({
          pubkey: matchedProfile.pubkey,
          profiles,
        })
      : item.commit.authorName || item.commit.authorEmail || "Unknown author";
    const matchingContributor = (item.repoContributors ?? []).find(
      (contributor) =>
        contributor.name.trim().toLowerCase() ===
          item.commit.authorName.trim().toLowerCase() ||
        contributor.email.trim().toLowerCase() ===
          item.commit.authorEmail.trim().toLowerCase(),
    );
    return (
      <ProjectWorkItemRow
        eventId={item.commit.hash}
        identifier={item.commit.shortHash}
        identifierClassName="font-mono"
        identifierTitle={`View commit ${item.commit.shortHash}`}
        key={`${item.project.repoAddress}:${item.commit.hash}`}
        metadata={
          showRepositoryName || item.branch ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              {showRepositoryName ? (
                <>
                  <FolderGit2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.project.name}</span>
                </>
              ) : (
                <>
                  <GitBranch className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.branch}</span>
                </>
              )}
            </span>
          ) : undefined
        }
        onOpen={
          onSelectCommit
            ? () => onSelectCommit(item.commit, item.project)
            : undefined
        }
        selection={{
          item: commitSelectionItem(
            item.commit,
            item.project,
            item.projectId,
            matchedProfile?.pubkey,
          ),
          rangeItems,
        }}
        statusIcon={
          <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground/70" />
        }
        testId="project-activity-feed-item"
        title={item.commit.subject}
        trailing={
          <>
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center"
              data-testid="project-commit-author"
              title={`Committed by ${authorLabel}${
                matchingContributor?.commitCount
                  ? ` · ${matchingContributor.commitCount} ${
                      matchingContributor.commitCount === 1
                        ? "commit"
                        : "commits"
                    }`
                  : ""
              }`}
            >
              <ProfileIdentityButton
                avatarClassName="shrink-0"
                avatarSize="xs"
                avatarUrl={matchedProfile?.profile.avatarUrl ?? null}
                isAgent={matchedProfile?.profile.isAgent === true}
                label={authorLabel}
                pubkey={matchedProfile?.pubkey ?? null}
                showLabel={false}
              />
            </span>
            <CopyCommitHashButton
              className="h-5 w-5 shrink-0 text-muted-foreground/60"
              hash={item.commit.hash}
            />
            <span
              className="hidden w-20 shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground/55 sm:block"
              data-testid="project-commit-row-date"
              title={new Date(item.commit.timestamp * 1_000).toLocaleString()}
            >
              {relativeTime(item.commit.timestamp)}
            </span>
          </>
        }
      />
    );
  };

  if (items.length > VIRTUALIZE_AFTER) {
    return (
      <VirtualizedList
        className="max-h-[70vh]"
        estimateSize={56}
        getItemKey={(item) => `${item.project.repoAddress}:${item.commit.hash}`}
        items={[...items]}
        renderItem={renderItem}
      />
    );
  }

  return <div className="space-y-0.5 px-2">{items.map(renderItem)}</div>;
}

function hulaRootsFromItems(items: readonly CommitFeedItem[]): string[] {
  const roots = new Set<string>();
  for (const item of items) {
    const root = item.project.hulaPath?.trim();
    if (root) roots.add(root);
  }
  return [...roots].sort();
}

function allCommitFeedItems(
  items: readonly CommitFeedItem[],
  lists: ReturnType<typeof useHulaAllCommitLists>,
): CommitFeedItem[] {
  const rows: CommitFeedItem[] = [];
  for (const list of lists) {
    if (list.error || list.isLoading) continue;
    const sample = items.find(
      (item) => item.project.hulaPath?.trim() === list.root,
    );
    if (!sample) continue;
    for (const commit of list.commits) {
      rows.push({
        commit,
        project: sample.project,
        projectId: sample.projectId,
        pullRequests: sample.pullRequests,
        repoContributors: sample.repoContributors,
      });
    }
  }
  rows.sort((left, right) => right.commit.timestamp - left.commit.timestamp);
  return rows;
}

/**
 * Full commit list for one ref, or for every repository on the project home.
 * This branch is that ref. All commits reads every local branch.
 * Narrowing filters do not drop commits from the loaded list.
 */
export function ProjectCommitList({
  historyTruncated = false,
  items,
  onSelectCommit,
  profiles,
  viewerGitIdentity,
}: {
  historyTruncated?: boolean;
  items: CommitFeedItem[];
  onSelectCommit?: (commit: ProjectRepoCommit, project: Repository) => void;
  profiles?: UserProfileLookup;
  viewerGitIdentity?: ViewerGitIdentity | null;
}) {
  const [historyScope, setHistoryScope] =
    React.useState<CommitHistoryScope>("branch");
  const hulaRoots = React.useMemo(() => hulaRootsFromItems(items), [items]);
  const canReadAll = hulaRoots.length > 0;
  const showingAll = canReadAll && historyScope === COMMIT_HISTORY_ALL;
  const allLists = useHulaAllCommitLists(hulaRoots, showingAll);
  const historyLoading = showingAll && allLists.some((list) => list.isLoading);
  const historyError =
    showingAll && allLists.some((list) => list.error != null);
  const listedItems =
    showingAll && !historyLoading ? allCommitFeedItems(items, allLists) : items;
  const showRepositoryName =
    new Set(items.map((item) => item.project.repoAddress)).size > 1;
  return (
    <ProjectCommitBrowser
      historyError={historyError}
      historyLoading={historyLoading}
      historyScope={canReadAll ? historyScope : undefined}
      historyTruncated={
        showingAll ? allLists.some((list) => list.truncated) : historyTruncated
      }
      items={showingAll && historyLoading ? [] : listedItems}
      onHistoryScopeChange={canReadAll ? setHistoryScope : undefined}
      renderItems={(filtered) => (
        <CommitRows
          items={filtered}
          onSelectCommit={onSelectCommit}
          profiles={profiles}
          showRepositoryName={showRepositoryName}
          viewerGitIdentity={viewerGitIdentity}
        />
      )}
    />
  );
}
