import * as React from "react";
import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useChannelMessagesQueries } from "@/features/messages/hooks";
import { CHANNEL_MESSAGE_EVENT_KINDS } from "@/shared/constants/kinds";
import {
  useManagedAgentsQuery,
  useRelayAgentsQuery,
} from "@/features/agents/hooks";
import { loadLocalCommunityBots } from "@/features/community-bots/lib/catalog";
import { useCommunityBotsQuery } from "@/features/community-bots/hooks";
import { useRelayMembersQuery } from "@/features/community-members/hooks";
import { useCommunities } from "@/features/communities/useCommunities";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import type {
  Project,
  ProjectIssueListItem,
  ProjectPullRequest,
  ProjectPullRequestListItem,
  Repository,
} from "@/features/projects/hooks";
import {
  ACTIVITY_MEMBER_EVERYONE,
  ACTIVITY_MEMBER_SECTIONS,
  ACTIVITY_SORT_OPTIONS,
  activityAuthorPubkeys,
  activityCommitAuthorNames,
  activityMemberFromId,
  activityMemberOptions,
  type ActivitySort,
} from "@/features/projects/lib/projectsIndexActivityPeople";
import {
  activityScopeChannelMemberPubkeys,
  activityWorkItemInScope,
  projectsIndexActivityScope,
  type ProjectsIndexActivityFilter,
} from "@/features/projects/lib/projectsIndexActivityScope";
import { projectRepoHostForProject } from "@/features/projects/lib/projectRepoHost";
import { collectProjectRelatedChannelRows } from "@/features/projects/lib/projectRelatedChannels";
import type { ProjectsIndexChannel } from "@/features/projects/lib/projectsIndexTree";
import type { ProjectWorkItemSection } from "@/features/projects/projectWorkItems";
import {
  ACTIVITY_TYPE_ALL,
  ACTIVITY_TYPE_OPTIONS,
  type ActivityType,
  type ProjectActivityChannelMessage,
  ProjectsActivityFeed,
} from "@/features/projects/ui/ProjectsActivityFeed";
import { ProjectsWorkItemsLoadNotice } from "@/features/projects/ui/ProjectsWorkItemsLoadNotice";
import { PROJECT_COLUMN_HEADER_BACKDROP_CLASS } from "@/features/projects/ui/projectPanelStyles";
import { useProjectsRepoSnapshotsQuery } from "@/features/projects/useProjectsRepoSnapshots";
import { useIdentityQuery } from "@/shared/api/hooks";
import { useRelayOrigin } from "@/shared/lib/useRelayOrigin";
import { cn } from "@/shared/lib/cn";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { Button } from "@/shared/ui/button";
import { DrawerPanelIcon } from "@/shared/ui/DrawerPanelIcon";

const ACTIVITY_SELECT_CLASS =
  "h-8 w-full min-w-0 truncate rounded-md bg-transparent px-2 text-xs text-foreground outline-hidden hover:bg-muted/50 focus:ring-1 focus:ring-ring";

const ALL_VALUE = "all";

function encodeFilter(filter: ProjectsIndexActivityFilter) {
  if (filter.type === "project") return `project:${filter.projectId}`;
  if (filter.type === "channel") return `channel:${filter.channelId}`;
  return ALL_VALUE;
}

function decodeFilter(value: string): ProjectsIndexActivityFilter {
  if (value.startsWith("project:")) {
    return { type: "project", projectId: value.slice("project:".length) };
  }
  if (value.startsWith("channel:")) {
    return { type: "channel", channelId: value.slice("channel:".length) };
  }
  return { type: "all" };
}

function collectActivityChannelIds(
  filter: ProjectsIndexActivityFilter,
  projects: readonly Project[],
  channelsById: ReadonlyMap<string, ProjectsIndexChannel>,
) {
  const rows = collectProjectRelatedChannelRows(projects);
  const ids = new Set<string>();
  if (filter.type === "channel") {
    ids.add(filter.channelId);
  } else {
    for (const row of rows) {
      if (filter.type === "project" && row.projectId !== filter.projectId) {
        continue;
      }
      ids.add(row.channelId);
    }
  }
  return [...ids].filter((channelId) => {
    const channel = channelsById.get(channelId);
    return channel != null && channel.channelType !== "forum";
  });
}

const CHAT_EVENT_KINDS = new Set<number>(CHANNEL_MESSAGE_EVENT_KINDS);

function actorPubkeys(
  projects: readonly Project[],
  issues: readonly ProjectIssueListItem[],
  pullRequests: readonly ProjectPullRequestListItem[],
  chatMessages: readonly ProjectActivityChannelMessage[],
) {
  const pubkeys = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (value) pubkeys.add(normalizePubkey(value));
  };
  for (const project of projects) add(project.owner);
  for (const { issue } of issues) {
    add(issue.author);
    for (const pubkey of issue.assignees) add(pubkey);
    for (const comment of issue.comments) add(comment.author);
  }
  for (const { pullRequest } of pullRequests) {
    add(pullRequest.author);
    for (const pubkey of pullRequest.reviewers) add(pubkey);
    for (const comment of pullRequest.comments) add(comment.author);
    for (const update of pullRequest.updates) add(update.author);
  }
  for (const { event } of chatMessages) add(event.pubkey);
  return [...pubkeys];
}

/**
 * The Activity chip's feed, beside the project tree. Events come from the
 * same issues, reviews, repository snapshots, and scoped project-channel
 * messages that feed uses. The header
 * narrows them to one loaded project or channel, then to one person,
 * community bot, or local agent, and orders those events newest or oldest.
 */
export function ProjectsIndexActivity({
  channelsById,
  collapsed,
  issues,
  onRetryWorkItems,
  onToggleCollapsed,
  projects,
  pullRequests,
  workItemsFailedSections,
  workItemsError,
  workItemsLoading,
  workItemsRetrying,
}: {
  channelsById: ReadonlyMap<string, ProjectsIndexChannel>;
  collapsed: boolean;
  issues: ProjectIssueListItem[];
  onRetryWorkItems: () => void;
  onToggleCollapsed: () => void;
  projects: Project[];
  pullRequests: ProjectPullRequestListItem[];
  workItemsError: unknown;
  workItemsFailedSections: ProjectWorkItemSection[];
  workItemsLoading: boolean;
  workItemsRetrying: boolean;
}) {
  const { goChannel, goProject } = useAppNavigation();
  const { activeCommunity } = useCommunities();
  const relayOrigin = useRelayOrigin();
  const [filter, setFilter] = React.useState<ProjectsIndexActivityFilter>({
    type: "all",
  });
  const [memberId, setMemberId] = React.useState(ACTIVITY_MEMBER_EVERYONE);
  const [activityType, setActivityType] =
    React.useState<ActivityType>(ACTIVITY_TYPE_ALL);
  const [sort, setSort] = React.useState<ActivitySort>("newest");
  // Rosters are read only when some other view already loaded them. This
  // pane does not start those fetches.
  const membersQuery = useRelayMembersQuery(false);
  const botsQuery = useCommunityBotsQuery(false);
  const relayAgentsQuery = useRelayAgentsQuery({ enabled: false });
  const managedAgentsQuery = useManagedAgentsQuery({ enabled: false });
  const identityQuery = useIdentityQuery();
  const [ownerPubkeys, setOwnerPubkeys] = React.useState<readonly string[]>([]);
  const knownBots = React.useMemo(
    () =>
      botsQuery.data ?? loadLocalCommunityBots(activeCommunity?.relayUrl ?? ""),
    [activeCommunity?.relayUrl, botsQuery.data],
  );
  const snapshotProjects = React.useMemo(
    () =>
      projects.filter(
        (project) =>
          projectRepoHostForProject(project, relayOrigin).kind === "buzz",
      ),
    [projects, relayOrigin],
  );
  const repoSnapshotsQuery = useProjectsRepoSnapshotsQuery(
    snapshotProjects,
    activeCommunity?.reposDir,
  );
  const scope = React.useMemo(
    () => projectsIndexActivityScope(filter, projects),
    [filter, projects],
  );
  const activityChannelIds = React.useMemo(
    () => collectActivityChannelIds(filter, projects, channelsById),
    [channelsById, filter, projects],
  );
  const activityChannelQueries = useChannelMessagesQueries(activityChannelIds);
  const chatMessages = React.useMemo(() => {
    const messages: ProjectActivityChannelMessage[] = [];
    for (let index = 0; index < activityChannelQueries.length; index += 1) {
      const channelId = activityChannelIds[index];
      const channel = channelsById.get(channelId);
      if (!channel) continue;
      const channelName = channel.name?.trim() || "Channel";
      for (const event of activityChannelQueries[index]?.data ?? []) {
        if (!CHAT_EVENT_KINDS.has(event.kind)) continue;
        messages.push({ channelId, channelName, event });
      }
    }
    return messages;
  }, [activityChannelIds, activityChannelQueries, channelsById]);
  const chatEvents = React.useMemo(
    () => chatMessages.map(({ event }) => event),
    [chatMessages],
  );
  const scopedProjects = React.useMemo(() => {
    if (!scope) return projects;
    const ids = new Set(
      scope.entries
        .filter((entry) => entry.includeProjectEvents)
        .map((entry) => entry.projectId),
    );
    return projects.filter((project) => ids.has(project.id));
  }, [projects, scope]);
  const scopedIssues = React.useMemo(
    () =>
      issues.filter((item) =>
        activityWorkItemInScope(scope, item.project.id, item.repository.id),
      ),
    [issues, scope],
  );
  const scopedPullRequests = React.useMemo(
    () =>
      pullRequests.filter((item) =>
        activityWorkItemInScope(scope, item.project.id, item.repository.id),
      ),
    [pullRequests, scope],
  );
  const snapshots = React.useMemo(() => {
    const all = repoSnapshotsQuery.data?.snapshots;
    if (!all || !scope) return all;
    const ids = new Set(scopedProjects.map((project) => project.id));
    return Object.fromEntries(
      Object.entries(all).filter(([projectId]) => ids.has(projectId)),
    );
  }, [repoSnapshotsQuery.data?.snapshots, scope, scopedProjects]);
  const profilePubkeys = React.useMemo(() => {
    const pubkeys = new Set(
      actorPubkeys(projects, issues, pullRequests, chatMessages),
    );
    for (const member of membersQuery.data ?? []) {
      if (member.pubkey) pubkeys.add(normalizePubkey(member.pubkey));
    }
    for (const bot of knownBots) {
      if (bot.pubkey) pubkeys.add(normalizePubkey(bot.pubkey));
    }
    for (const agent of managedAgentsQuery.data ?? []) {
      if (agent.pubkey) pubkeys.add(normalizePubkey(agent.pubkey));
    }
    for (const agent of relayAgentsQuery.data ?? []) {
      if (agent.pubkey) pubkeys.add(normalizePubkey(agent.pubkey));
      if (agent.ownerPubkey) pubkeys.add(normalizePubkey(agent.ownerPubkey));
    }
    for (const pubkey of ownerPubkeys) pubkeys.add(pubkey);
    return [...pubkeys];
  }, [
    chatMessages,
    issues,
    knownBots,
    managedAgentsQuery.data,
    membersQuery.data,
    ownerPubkeys,
    projects,
    pullRequests,
    relayAgentsQuery.data,
  ]);
  const profiles = useUsersBatchQuery(profilePubkeys, {
    enabled: profilePubkeys.length > 0,
  }).data?.profiles;
  React.useEffect(() => {
    if (!profiles) return;
    const known = new Set(profilePubkeys);
    const extra: string[] = [];
    for (const profile of Object.values(profiles)) {
      const owner = profile.ownerPubkey?.trim();
      if (!owner) continue;
      const normalized = normalizePubkey(owner);
      if (!normalized || known.has(normalized)) continue;
      known.add(normalized);
      extra.push(normalized);
    }
    if (extra.length === 0) return;
    setOwnerPubkeys((current) => {
      const next = new Set(current);
      let changed = false;
      for (const pubkey of extra) {
        if (next.has(pubkey)) continue;
        next.add(pubkey);
        changed = true;
      }
      return changed ? [...next] : current;
    });
  }, [profilePubkeys, profiles]);
  const memberProfiles = React.useMemo(() => {
    const identity = identityQuery.data;
    const name = identity?.displayName?.trim();
    if (!identity?.pubkey || !name) return profiles;
    const pubkey = normalizePubkey(identity.pubkey);
    const existing = profiles?.[pubkey];
    if (
      existing?.displayName?.trim() ||
      existing?.name?.trim() ||
      existing?.nip05Handle?.trim()
    ) {
      return profiles;
    }
    return {
      ...(profiles ?? {}),
      [pubkey]: {
        avatarUrl: existing?.avatarUrl ?? null,
        displayName: name,
        isAgent: existing?.isAgent,
        name: existing?.name ?? null,
        nip05Handle: existing?.nip05Handle ?? null,
        ownerPubkey: existing?.ownerPubkey ?? null,
      },
    };
  }, [identityQuery.data, profiles]);
  const scopeChannelMembers = React.useMemo(
    () => activityScopeChannelMemberPubkeys(filter, projects, channelsById),
    [channelsById, filter, projects],
  );
  const scopedAuthorPubkeys = React.useMemo(
    () =>
      activityAuthorPubkeys({
        chatMessages: chatEvents,
        issues: scopedIssues,
        projects: scopedProjects,
        pullRequests: scopedPullRequests,
      }),
    [chatEvents, scopedIssues, scopedProjects, scopedPullRequests],
  );
  // All keeps the loaded rosters. A project or channel lists only authors of
  // the events that remain, plus members of the channels related to that project.
  const scopedPubkeys = React.useMemo(() => {
    if (!scopeChannelMembers) return null;
    const pubkeys = new Set(scopeChannelMembers);
    for (const pubkey of scopedAuthorPubkeys) pubkeys.add(pubkey);
    return pubkeys;
  }, [scopeChannelMembers, scopedAuthorPubkeys]);
  const memberOptions = React.useMemo(
    () =>
      activityMemberOptions({
        authorNames: activityCommitAuthorNames(snapshots),
        authorPubkeys: scopedAuthorPubkeys,
        bots: knownBots,
        managedAgents: managedAgentsQuery.data,
        members: membersQuery.data,
        profiles: memberProfiles,
        relayAgents: relayAgentsQuery.data,
        scopedPubkeys,
      }),
    [
      knownBots,
      managedAgentsQuery.data,
      memberProfiles,
      membersQuery.data,
      relayAgentsQuery.data,
      scopedAuthorPubkeys,
      scopedPubkeys,
      snapshots,
    ],
  );
  const selectedMember = React.useMemo(() => {
    if (memberId === ACTIVITY_MEMBER_EVERYONE) return null;
    return (
      memberOptions.find((option) => option.id === memberId) ??
      activityMemberFromId(memberId)
    );
  }, [memberId, memberOptions]);

  const projectOptions = React.useMemo(
    () =>
      [...projects]
        .map((project) => ({ id: project.id, label: project.name }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [projects],
  );
  const channelOptions = React.useMemo(() => {
    const options = new Map<string, string>();
    for (const row of collectProjectRelatedChannelRows(projects)) {
      const channel = channelsById.get(row.channelId);
      if (!channel || options.has(row.channelId)) continue;
      const name = channel.name?.trim() || "Channel";
      options.set(row.channelId, `#${name}`);
    }
    return [...options.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [channelsById, projects]);

  React.useEffect(() => {
    if (filter.type === "project") {
      if (!projectOptions.some((option) => option.id === filter.projectId)) {
        setFilter({ type: "all" });
      }
    } else if (filter.type === "channel") {
      if (!channelOptions.some((option) => option.id === filter.channelId)) {
        setFilter({ type: "all" });
      }
    }
  }, [channelOptions, filter, projectOptions]);

  React.useEffect(() => {
    if (memberId === ACTIVITY_MEMBER_EVERYONE) return;
    if (!memberOptions.some((option) => option.id === memberId)) {
      setMemberId(ACTIVITY_MEMBER_EVERYONE);
    }
  }, [memberId, memberOptions]);

  const openProject = React.useCallback(
    (project: Project) => {
      void goProject(project.id);
    },
    [goProject],
  );
  const openChat = React.useCallback(
    (channelId: string, messageId: string) => {
      void goChannel(channelId, { messageId });
    },
    [goChannel],
  );
  const openCommit = React.useCallback(
    (project: Project, commitHash: string) => {
      void goProject(project.id, { commitHash, tab: "commits" });
    },
    [goProject],
  );
  const openPullRequest = React.useCallback(
    (
      project: Project,
      repository: Repository,
      pullRequest: ProjectPullRequest,
    ) => {
      void goProject(project.id, {
        pullRequestId: pullRequest.id,
        repositoryId: repository.id,
      });
    },
    [goProject],
  );
  const openIssue = React.useCallback(
    (
      project: Project,
      repository: Repository,
      issue: ProjectIssueListItem["issue"],
    ) => {
      void goProject(project.id, {
        issueId: issue.id,
        repositoryId: repository.id,
      });
    },
    [goProject],
  );

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border-l border-border/60 transition-[width] duration-200",
        collapsed ? "w-10" : "w-1/2",
      )}
      data-testid="projects-index-activity"
    >
      <div
        className={cn(
          "flex h-13 min-w-0 items-center gap-2",
          collapsed ? "justify-center px-1" : "px-4",
          PROJECT_COLUMN_HEADER_BACKDROP_CLASS,
        )}
      >
        {collapsed ? null : (
          <>
            <span className="shrink-0 text-sm font-medium">Activity</span>
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Filter activity</span>
                <select
                  className={ACTIVITY_SELECT_CLASS}
                  data-testid="projects-index-activity-filter"
                  onChange={(event) =>
                    setFilter(decodeFilter(event.target.value))
                  }
                  value={encodeFilter(filter)}
                >
                  <option value={ALL_VALUE}>All</option>
                  {projectOptions.length > 0 ? (
                    <optgroup label="Projects">
                      {projectOptions.map((option) => (
                        <option key={option.id} value={`project:${option.id}`}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {channelOptions.length > 0 ? (
                    <optgroup label="Channels">
                      {channelOptions.map((option) => (
                        <option key={option.id} value={`channel:${option.id}`}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Filter activity by type</span>
                <select
                  className={ACTIVITY_SELECT_CLASS}
                  data-testid="projects-index-activity-type"
                  onChange={(event) =>
                    setActivityType(event.target.value as ActivityType)
                  }
                  value={activityType}
                >
                  {ACTIVITY_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Filter activity by member</span>
                <select
                  className={ACTIVITY_SELECT_CLASS}
                  data-testid="projects-index-activity-member"
                  onChange={(event) => setMemberId(event.target.value)}
                  value={memberId}
                >
                  <option value={ACTIVITY_MEMBER_EVERYONE}>Everyone</option>
                  {ACTIVITY_MEMBER_SECTIONS.map((section) => {
                    const options = memberOptions.filter(
                      (option) => option.section === section.id,
                    );
                    if (options.length === 0) return null;
                    return (
                      <optgroup key={section.id} label={section.label}>
                        {options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </label>
              <label className="w-24 shrink-0">
                <span className="sr-only">Sort activity</span>
                <select
                  className={ACTIVITY_SELECT_CLASS}
                  data-testid="projects-index-activity-sort"
                  onChange={(event) =>
                    setSort(event.target.value as ActivitySort)
                  }
                  value={sort}
                >
                  {ACTIVITY_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
        <Button
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand activity" : "Collapse activity"}
          className={cn(
            "h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground",
            !collapsed && "ml-auto",
          )}
          data-testid="projects-index-activity-toggle"
          onClick={onToggleCollapsed}
          size="icon"
          title={collapsed ? "Expand activity" : "Collapse activity"}
          type="button"
          variant="ghost"
        >
          <DrawerPanelIcon
            className="-scale-x-100"
            side={collapsed ? "right" : "left"}
          />
        </Button>
      </div>
      {collapsed ? null : (
        <div className="buzz-content-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4">
          <div className="space-y-3">
            <ProjectsWorkItemsLoadNotice
              error={workItemsError}
              failedSections={workItemsFailedSections}
              isRetrying={workItemsRetrying}
              onRetry={onRetryWorkItems}
              subject="project activity"
            />
            <ProjectsActivityFeed
              isLoading={
                repoSnapshotsQuery.isLoading ||
                workItemsLoading ||
                activityChannelQueries.some((query) => query.isLoading)
              }
              activityType={activityType}
              chatMessages={chatMessages}
              issues={scopedIssues}
              member={selectedMember}
              onOpenChat={openChat}
              onOpenCommit={openCommit}
              onOpenIssue={openIssue}
              onOpenProject={openProject}
              onOpenPullRequest={openPullRequest}
              profiles={profiles}
              projects={scopedProjects}
              pullRequests={scopedPullRequests}
              scoped={scope !== null}
              snapshots={snapshots}
              sort={sort}
            />
          </div>
        </div>
      )}
    </div>
  );
}
