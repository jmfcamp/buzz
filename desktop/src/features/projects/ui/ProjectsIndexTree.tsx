import {
  ChevronRight,
  CircleDot,
  FolderGit2,
  Folders,
  Hash,
} from "lucide-react";
import * as React from "react";

import type {
  Project,
  ProjectActivitySummary,
  ProjectIssue,
  Repository,
} from "@/features/projects/hooks";
import { projectRelatedChannelDisplayRowKey } from "@/features/projects/lib/projectRelatedChannels";
import { repositoryRowRoleLabel } from "@/features/projects/lib/repositoryListRoles";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import { ProjectCodingAgentChip } from "@/features/projects/ui/ProjectCodingAgentIdentity";
import { RepositoryRowMeta } from "@/features/projects/ui/RepositoryRowBranch";
import { ProjectDriIdentity } from "@/features/projects/ui/ProjectDriIdentity";
import {
  groupProjectsIndexTasks,
  projectDriPubkey,
  projectsIndexChannelMemberPubkeys,
  type ProjectsIndexChannel,
  type ProjectsIndexTreeNode,
} from "@/features/projects/lib/projectsIndexTree";
import { EmptyFilteredState } from "@/features/projects/ui/ProjectCards";
import { IssueAssigneeFacepile } from "@/features/projects/ui/IssueAssigneesRow";
import { ProjectEntityFacepile } from "@/features/projects/ui/ProjectEntityListRow";
import { ProjectIssueStatusChip } from "@/features/projects/ui/ProjectIssuesPanel";
import { cn } from "@/shared/lib/cn";

const ROW_CLASS =
  "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 text-left text-sm text-foreground/90 transition-colors hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

const PROJECT_BLOCK_CLASS =
  "rounded-xl border border-border/60 bg-muted/20 p-2";

const PROJECT_HEADER_CLASS = cn(ROW_CLASS, "h-8 font-semibold text-foreground");

const SECTION_SURFACE_CLASS =
  "overflow-hidden rounded-lg border border-border/40 bg-background/40";

const SECTION_CLASS =
  "flex h-7 w-full min-w-0 items-center gap-1.5 px-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

const TASK_GROUP_BACKGROUND_CLASS = {
  queued: "bg-amber-500/10",
  "in progress": "bg-amber-500/10",
  done: "bg-purple-400/10",
} as const;

type SectionKey = "repositories" | "channels" | "tasks";

/** A loaded commit keeps its full hash for navigation but shows only its short id. */
function loadedRepositoryCommit(
  summary: ProjectActivitySummary | undefined,
): { hash: string; shortHash: string; subject: string } | null {
  const commit = summary?.latestCommit;
  if (!commit) return null;
  const hash = commit.commit.trim();
  if (!hash) return null;
  return {
    hash,
    shortHash: hash.slice(0, 7),
    subject: commit.title.trim(),
  };
}

function sectionStateKey(projectId: string, section: SectionKey) {
  return `${projectId}:${section}`;
}

function taskGroupStateKey(projectId: string, word: string) {
  return `${projectId}:tasks:${word}`;
}

/** Done starts collapsed. Every other section starts expanded. */
function sectionIsOpen(
  collapsed: ReadonlySet<string>,
  key: string,
  startsCollapsed = false,
) {
  return startsCollapsed ? collapsed.has(key) : !collapsed.has(key);
}

function RepositoryRoleBadge({ label }: { label: string }) {
  return (
    <span
      className="shrink-0 rounded border border-border/70 bg-muted/40 px-1.5 py-px text-2xs font-medium text-muted-foreground"
      data-testid="repository-row-role"
    >
      {label}
    </span>
  );
}

function IndexSection({
  children,
  icon,
  label,
  onToggle,
  open,
  testId,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  label: string;
  onToggle: () => void;
  open: boolean;
  testId: string;
}) {
  return (
    <div
      className={SECTION_SURFACE_CLASS}
      data-open={open ? "true" : "false"}
      data-testid={testId}
    >
      <button
        aria-expanded={open}
        className={SECTION_CLASS}
        onClick={onToggle}
        type="button"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
            open && "rotate-90",
          )}
        />
        {icon}
        <span className="truncate">{label}</span>
      </button>
      {open ? <div className="px-1 pb-1">{children}</div> : null}
    </div>
  );
}


export function ProjectsIndexTree({
  channelsById,
  channelsLoading = false,
  collapsedProjectIds,
  nodes,
  onOpenChannel,
  onToggleProject,
  onOpenIssue,
  onOpenProject,
  onOpenRepository,
  onOpenRepositoryBranch,
  onOpenRepositoryCommit,
  repositorySummaries,
  searching,
}: {
  channelsById: ReadonlyMap<string, ProjectsIndexChannel>;
  channelsLoading?: boolean;
  collapsedProjectIds: ReadonlySet<string>;
  nodes: readonly ProjectsIndexTreeNode[];
  onOpenChannel: (channelId: string) => void;
  onToggleProject: (projectId: string) => void;
  onOpenIssue: (
    project: Project,
    repository: Repository,
    issue: ProjectIssue,
  ) => void;
  onOpenProject: (project: Project) => void;
  onOpenRepository: (project: Project, repository: Repository) => void;
  onOpenRepositoryBranch: (project: Project, repository: Repository) => void;
  onOpenRepositoryCommit: (
    project: Project,
    repository: Repository,
    commitHash: string,
  ) => void;
  repositorySummaries?: Record<string, ProjectActivitySummary>;
  searching: boolean;
}) {
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggle = React.useCallback((key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const profilePubkeys = React.useMemo(() => {
    const pubkeys = new Set<string>();
    for (const node of nodes) {
      const dri = projectDriPubkey(node.project);
      if (dri) pubkeys.add(dri);
      for (const row of node.channels) {
        const members = projectsIndexChannelMemberPubkeys(
          channelsById.get(row.channelId),
        );
        if (!members) continue;
        for (const pubkey of members.slice(0, 4)) pubkeys.add(pubkey);
      }
      for (const item of node.issues) {
        for (const pubkey of item.issue.assignees) pubkeys.add(pubkey);
      }
    }
    return [...pubkeys];
  }, [channelsById, nodes]);
  const profiles = useUsersBatchQuery(profilePubkeys, {
    enabled: profilePubkeys.length > 0,
  }).data?.profiles;

  if (nodes.length === 0) {
    return searching ? <EmptyFilteredState /> : null;
  }

  return (
    <div className="space-y-3" data-testid="projects-index-tree">
      {nodes.map((node) => {
        const { project } = node;
        const projectOpen = !collapsedProjectIds.has(project.id);
        const repositoriesOpen = sectionIsOpen(
          collapsed,
          sectionStateKey(project.id, "repositories"),
        );
        const channelsOpen = sectionIsOpen(
          collapsed,
          sectionStateKey(project.id, "channels"),
        );
        const tasksOpen = sectionIsOpen(
          collapsed,
          sectionStateKey(project.id, "tasks"),
        );
        const driPubkey = projectDriPubkey(project);
        return (
          <section className={PROJECT_BLOCK_CLASS} key={project.id}>
            <div
              className="flex h-8 w-full min-w-0 items-center gap-1"
              data-testid={`project-row-${project.dtag}`}
            >
              <button
                aria-expanded={projectOpen}
                aria-label={`${projectOpen ? "Collapse" : "Expand"} ${project.name}`}
                className={cn(
                  PROJECT_HEADER_CLASS,
                  "h-8 w-8 shrink-0 justify-center px-0",
                )}
                data-testid={`projects-index-project-toggle-${project.dtag}`}
                onClick={() => onToggleProject(project.id)}
                title={`${projectOpen ? "Collapse" : "Expand"} ${project.name}`}
                type="button"
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-150",
                    projectOpen && "rotate-90",
                  )}
                />
              </button>
              <button
                className={cn(PROJECT_HEADER_CLASS, "w-auto min-w-0 flex-1")}
                onClick={() => onOpenProject(project)}
                title={`Open ${project.name}`}
                type="button"
              >
                <Folders className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </button>
              {driPubkey ? (
                <ProjectDriIdentity profiles={profiles} pubkey={driPubkey} />
              ) : null}
              <ProjectCodingAgentChip
                channelId={project.projectChannelId}
                designatedPubkey={project.codingAgent}
              />
            </div>
            {projectOpen ? (
              <div className="mt-1.5 space-y-1.5">
                <IndexSection
                  icon={<FolderGit2 className="h-3.5 w-3.5 shrink-0" />}
                  label="Repositories"
                  onToggle={() =>
                    toggle(sectionStateKey(project.id, "repositories"))
                  }
                  open={repositoriesOpen}
                  testId={`projects-index-section-${project.dtag}-repositories`}
                >
                  {node.repositories.map((item) => {
                    const roleLabel = repositoryRowRoleLabel(item.role);
                    const commit = loadedRepositoryCommit(
                      repositorySummaries?.[item.row.repository.repoAddress],
                    );
                    return (
                      <div
                        className={cn(item.nested && "ml-4")}
                        data-repository-role={item.role.kind}
                        key={item.row.repository.repoAddress}
                      >
                        <div className={ROW_CLASS}>
                          <button
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                            data-testid={`repository-row-${item.row.repository.dtag}`}
                            onClick={() =>
                              onOpenRepository(
                                item.row.project,
                                item.row.repository,
                              )
                            }
                            title={item.row.repository.name}
                            type="button"
                          >
                            <span className="min-w-0 truncate">
                              {item.row.repository.name}
                            </span>
                            {roleLabel ? (
                              <RepositoryRoleBadge label={roleLabel} />
                            ) : null}
                          </button>
                          <RepositoryRowMeta
                            commit={commit}
                            onOpenBranch={() =>
                              onOpenRepositoryBranch(
                                item.row.project,
                                item.row.repository,
                              )
                            }
                            onOpenCommit={() => {
                              if (!commit) return;
                              onOpenRepositoryCommit(
                                item.row.project,
                                item.row.repository,
                                commit.hash,
                              );
                            }}
                            repository={item.row.repository}
                          />
                        </div>
                      </div>
                    );
                  })}
                </IndexSection>
                <IndexSection
                  icon={<Hash className="h-3.5 w-3.5 shrink-0" />}
                  label="Channels"
                  onToggle={() =>
                    toggle(sectionStateKey(project.id, "channels"))
                  }
                  open={channelsOpen}
                  testId={`projects-index-section-${project.dtag}-channels`}
                >
                  {node.channels.map((row) => {
                    const channel = channelsById.get(row.channelId);
                    const name =
                      channel?.name ??
                      (channelsLoading
                        ? "Loading channel"
                        : "Channel unavailable");
                    const members = projectsIndexChannelMemberPubkeys(channel);
                    return (
                      <div
                        className={ROW_CLASS}
                        data-testid="project-channel-row"
                        key={projectRelatedChannelDisplayRowKey(row)}
                      >
                        <button
                          className="flex min-w-0 flex-1 items-center text-left"
                          onClick={() => onOpenChannel(row.channelId)}
                          title={
                            channel
                              ? `Open #${name}`
                              : "Open unavailable channel"
                          }
                          type="button"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {channel ? `#${name}` : name}
                          </span>
                        </button>
                        {members && members.length > 0 ? (
                          <span
                            className="ml-auto shrink-0"
                            data-testid="project-channel-members"
                          >
                            <ProjectEntityFacepile
                              interactive
                              participants={[...members]}
                              profiles={profiles}
                            />
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </IndexSection>
                <IndexSection
                  icon={<CircleDot className="h-3.5 w-3.5 shrink-0" />}
                  label="Tasks"
                  onToggle={() => toggle(sectionStateKey(project.id, "tasks"))}
                  open={tasksOpen}
                  testId={`projects-index-section-${project.dtag}-tasks`}
                >
                  {groupProjectsIndexTasks(node.issues).map((group) => {
                    const key = taskGroupStateKey(project.id, group.word);
                    const open = sectionIsOpen(
                      collapsed,
                      key,
                      group.word === "done",
                    );
                    return (
                      <div
                        data-open={open ? "true" : "false"}
                        data-task-status={group.word}
                        data-testid={`projects-index-task-group-${project.dtag}-${group.word.split(" ").join("-")}`}
                        key={group.word}
                      >
                        <button
                          aria-expanded={open}
                          className={cn(
                            SECTION_CLASS,
                            TASK_GROUP_BACKGROUND_CLASS[group.word],
                          )}
                          onClick={() => toggle(key)}
                          type="button"
                        >
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 transition-transform duration-150",
                              open && "rotate-90",
                            )}
                          />
                          <span className="truncate">{group.word}</span>
                        </button>
                        {open
                          ? group.items.map(
                              ({
                                issue,
                                project: issueProject,
                                repository,
                              }) => (
                                <div
                                  className={ROW_CLASS}
                                  data-testid={`projects-issue-row-${issue.id}`}
                                  key={`${repository.id}:${issue.id}`}
                                >
                                  <button
                                    className="flex min-w-0 flex-1 items-center text-left"
                                    onClick={() =>
                                      onOpenIssue(
                                        issueProject,
                                        repository,
                                        issue,
                                      )
                                    }
                                    title={`Open task ${issue.title}`}
                                    type="button"
                                  >
                                    <span className="min-w-0 flex-1 truncate">
                                      {issue.title}
                                    </span>
                                  </button>
                                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                                    {issue.assignees.length > 0 ? (
                                      <IssueAssigneeFacepile
                                        assignees={issue.assignees}
                                        profiles={profiles}
                                      />
                                    ) : (
                                      <span
                                        className="text-xs text-muted-foreground"
                                        data-testid="project-issue-assignee-empty"
                                      >
                                        —
                                      </span>
                                    )}
                                    <ProjectIssueStatusChip
                                      status={issue.status}
                                    />
                                  </span>
                                </div>
                              ),
                            )
                          : null}
                      </div>
                    );
                  })}
                </IndexSection>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
