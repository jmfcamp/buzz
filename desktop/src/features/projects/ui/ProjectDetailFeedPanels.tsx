import {
  contributorKey,
  profileForContributor,
  type ProjectContributorActivityCounts,
  type ViewerGitIdentity,
} from "@/features/projects/lib/projectContributorMatching";
import type {
  ProjectPullRequest,
  ProjectRepoContributor,
  ProjectRepoSnapshot,
  Repository,
} from "@/features/projects/hooks";
import type { ProjectRepoCommit } from "@/shared/api/types";
import { truncateNpub } from "@/shared/lib/pubkey";
import { BuzzLoadingState } from "@/shared/ui/BuzzLoadingState";
import {
  resolveUserLabel,
  type UserProfileLookup,
} from "@/features/profile/lib/identity";
import { CircleDot, GitCommitHorizontal, GitPullRequest } from "lucide-react";

import { ProjectCommitList } from "./ProjectCommitList";
import { PROJECT_DETAIL_PANEL_CLASS } from "./projectPanelStyles";
import { ProfileIdentityButton } from "./ProjectProfileIdentity";
import { ProjectPanelState } from "./ProjectPanelState";

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function ContributorsPanel({
  activityCounts,
  contributorPubkeys,
  contributorPubkeysByGitIdentity,
  profiles,
  repoContributors,
}: {
  activityCounts: Record<string, ProjectContributorActivityCounts>;
  contributorPubkeys: string[];
  contributorPubkeysByGitIdentity: ReadonlyMap<string, string>;
  profiles?: UserProfileLookup;
  repoContributors: ProjectRepoContributor[];
}) {
  const gitRows = repoContributors.map((contributor) => {
    const signedPubkey = contributorPubkeysByGitIdentity.get(
      contributorKey(contributor),
    );
    const signedProfile = signedPubkey ? profiles?.[signedPubkey] : undefined;
    const heuristicProfile = signedPubkey
      ? null
      : profileForContributor(contributor, profiles);
    const matchedPubkey = signedPubkey ?? heuristicProfile?.pubkey ?? null;
    const matchedProfile = signedProfile ?? heuristicProfile?.profile;
    const label = matchedProfile
      ? resolveUserLabel({ pubkey: matchedPubkey ?? "", profiles })
      : contributor.name || contributor.email || "Unknown contributor";
    const signedCounts = matchedPubkey
      ? activityCounts[matchedPubkey]
      : undefined;

    return {
      avatarUrl: matchedProfile?.avatarUrl ?? null,
      commitCount: contributor.commitCount,
      id: `git:${contributorKey(contributor)}`,
      isAgent: matchedProfile?.isAgent === true,
      label,
      pubkey: matchedPubkey,
      profileLinked: matchedPubkey !== null,
      reviewCount: signedCounts?.reviews ?? null,
      role: signedPubkey
        ? matchedProfile?.nip05Handle || contributor.email || "Buzz contributor"
        : heuristicProfile
          ? `${
              heuristicProfile.profile.nip05Handle ||
              contributor.email ||
              "Git contributor"
            } · unverified match`
          : contributor.email || "Git contributor",
      taskCount: signedCounts?.tasks ?? null,
    };
  });
  const matchedPubkeys = new Set(
    gitRows
      .map((row) => row.pubkey)
      .filter((pubkey): pubkey is string => pubkey !== null),
  );
  const linkedRows = contributorPubkeys
    .filter((pubkey) => !matchedPubkeys.has(pubkey))
    .map((pubkey) => {
      const profile = profiles?.[pubkey];
      const isAgent = profile?.isAgent === true;
      const signedCounts = activityCounts[pubkey] ?? {
        commits: 0,
        reviews: 0,
        tasks: 0,
      };
      return {
        avatarUrl: profile?.avatarUrl ?? null,
        commitCount: signedCounts.commits,
        id: `buzz:${pubkey}`,
        isAgent,
        label: profile
          ? resolveUserLabel({ profiles, pubkey })
          : truncateNpub(pubkey),
        profileLinked: true,
        pubkey,
        reviewCount: signedCounts.reviews,
        role:
          profile?.nip05Handle ||
          (isAgent ? "Agent contributor" : "Buzz contributor"),
        taskCount: signedCounts.tasks,
      };
    });
  const rows = [
    ...gitRows.filter((row) => row.profileLinked),
    ...linkedRows,
    ...gitRows.filter((row) => !row.profileLinked),
  ].sort(
    (left, right) =>
      (right.commitCount ?? -1) - (left.commitCount ?? -1) ||
      left.label.localeCompare(right.label),
  );

  if (rows.length === 0) {
    return (
      <ProjectPanelState
        description="Contributors appear after signed project or repository activity."
        title="No contributors yet"
      />
    );
  }

  return (
    <div
      className={`${PROJECT_DETAIL_PANEL_CLASS} mx-4`}
      data-project-detail-panel
    >
      {rows.map((row) => (
        <div
          className="flex min-h-9 min-w-0 items-center gap-2 px-4 py-1.5 transition-colors hover:bg-muted/35"
          data-project-contributor-kind={row.isAgent ? "agent" : "human"}
          data-testid="project-contributor-row"
          key={row.id}
        >
          <ProfileIdentityButton
            avatarClassName="shrink-0"
            avatarSize="xs"
            avatarUrl={row.avatarUrl}
            isAgent={row.isAgent}
            label={row.label}
            pubkey={row.pubkey}
            showLabel={false}
          />
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
            data-projects-text-priority="primary"
            title={row.label}
          >
            {row.label}
          </span>
          <span
            className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:block"
            data-testid="project-contributor-identity"
            title={row.role}
          >
            {row.role}
          </span>
          <span
            className="flex w-14 shrink-0 items-center justify-end gap-1 text-xs tabular-nums text-muted-foreground"
            data-testid="project-contributor-commit-count"
            title={
              row.commitCount === null
                ? "No git commits"
                : pluralize(row.commitCount, "commit")
            }
          >
            <GitCommitHorizontal className="h-3.5 w-3.5" />
            {row.commitCount ?? 0}
          </span>
          <span
            className="flex w-14 shrink-0 items-center justify-end gap-1 text-xs tabular-nums text-muted-foreground"
            data-testid="project-contributor-review-count"
            title={
              row.reviewCount === null
                ? "No linked reviews"
                : pluralize(row.reviewCount, "review")
            }
          >
            <GitPullRequest className="h-3.5 w-3.5" />
            {row.reviewCount ?? 0}
          </span>
          <span
            className="flex w-14 shrink-0 items-center justify-end gap-1 text-xs tabular-nums text-muted-foreground"
            data-testid="project-contributor-task-count"
            title={
              row.taskCount === null
                ? "No linked tasks"
                : pluralize(row.taskCount, "task")
            }
          >
            <CircleDot className="h-3.5 w-3.5" />
            {row.taskCount ?? 0}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ActivityPanel({
  branch,
  commitItems,
  snapshot,
  isLoading,
  error,
  historyTruncated = false,
  onSelectCommit,
  profiles,
  project,
  projectId,
  pullRequests,
  repoContributors,
  viewerGitIdentity,
}: {
  branch?: string;
  commitItems?: Array<{
    branch?: string;
    commit: ProjectRepoCommit;
    project: Repository;
    projectId: string;
    pullRequests?: ProjectPullRequest[];
    repoContributors?: ProjectRepoContributor[];
  }>;
  snapshot: ProjectRepoSnapshot | null | undefined;
  isLoading: boolean;
  error: unknown;
  historyTruncated?: boolean;
  onSelectCommit?: (commit: ProjectRepoCommit, project: Repository) => void;
  profiles?: UserProfileLookup;
  project: Repository;
  projectId: string;
  pullRequests?: ProjectPullRequest[];
  repoContributors: ProjectRepoContributor[];
  viewerGitIdentity?: ViewerGitIdentity | null;
}) {
  const items =
    commitItems ??
    (snapshot?.commits ?? []).map((commit) => ({
      branch,
      commit,
      project,
      projectId,
      pullRequests,
      repoContributors,
    }));

  if (isLoading) {
    return <BuzzLoadingState label="Loading activity" />;
  }

  if (items.length === 0) {
    return (
      <ProjectPanelState
        description={
          error
            ? "Refresh the repository and try again."
            : commitItems
              ? "Commits pushed to this project's repositories will appear here."
              : "Commits pushed to this repository will appear here."
        }
        error={Boolean(error)}
        title={error ? "Could not load commits" : "No commits yet"}
      />
    );
  }

  return (
    <ProjectCommitList
      historyTruncated={historyTruncated || Boolean(snapshot?.historyTruncated)}
      items={items}
      onSelectCommit={onSelectCommit}
      profiles={profiles}
      viewerGitIdentity={viewerGitIdentity}
    />
  );
}
