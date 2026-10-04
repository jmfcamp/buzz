import {
  ChevronDown,
  CircleDot,
  FileCode2,
  FolderGit2,
  GitCommitHorizontal,
  Hash,
  Users,
} from "lucide-react";
import * as React from "react";

import { projectChannelSubRepositories } from "@/features/projects/lib/channelCodebase";
import { hasAuthoritativeHomeBinding } from "@/features/projects/lib/projectHomeChannel";
import {
  repositoryRowOpenTarget,
  repositoryRowRole,
} from "@/features/projects/lib/repositoryListRoles";
import { presentContextCount } from "@/features/projects/lib/projectHomeSummary";
import type { ProjectHomeWorkspaceSheetTab } from "@/features/projects/lib/projectHomeWorkspaceSheet";
import { resolveProjectDefaultBranch } from "@/features/projects/lib/projectBranches";
import { useHulaRepositorySnapshots } from "@/features/projects/useHulaRepositoryGit";
import { listProjectBoundChannels } from "@/features/projects/lib/projectRelatedChannels";
import {
  useProjectActivitySummariesQuery,
  useProjectRepoSnapshotQuery,
  useRepoStateQuery,
  type Project,
} from "@/features/projects/hooks";
import { ProjectChannelIcon } from "@/features/projects/ui/ProjectChannelIcon";
import type { Channel } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";
import type { EntityLinkTab } from "@/shared/lib/entityLink";
import { Button } from "@/shared/ui/button";
import { CheckoutWorkRail } from "./CheckoutWorkViews";
import { useCheckoutWorkContext } from "./checkoutWorkContext";
import { ProjectChannelManagement } from "./ProjectChannelManagement";
import { ProjectRepositoryManagement } from "./ProjectRepositoryManagement";
import { SECTION_ACTION_VISIBILITY_CLASS } from "@/features/sidebar/ui/sidebarSectionStyles";

const PROJECT_HOME_SIDEBAR_ROW_CLASS =
  "h-8 w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal text-sidebar-foreground/80 transition-[background-color,color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50";

function ContextSection({
  children,
  collapsible = false,
  headerAction,
  testId,
  title,
}: {
  children: React.ReactNode;
  collapsible?: boolean;
  headerAction?: React.ReactNode;
  testId?: string;
  title?: string;
}) {
  const [expanded, setExpanded] = React.useState(true);
  return (
    <section className="group/sidebar-section space-y-1" data-testid={testId}>
      {title || headerAction ? (
        <div className="flex h-8 min-w-0 items-center justify-between gap-2 px-2">
          {title && collapsible ? (
            <button
              aria-expanded={expanded}
              className="group/section-label flex min-w-0 items-center gap-1 text-left text-xs font-medium text-sidebar-foreground/70"
              onClick={() => setExpanded((current) => !current)}
              type="button"
            >
              <span className="truncate">{title}</span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-3 shrink-0 opacity-0 transition-[opacity,transform] group-hover/sidebar-section:opacity-100 group-focus-within/sidebar-section:opacity-100",
                  expanded ? "rotate-0" : "-rotate-90",
                )}
              />
            </button>
          ) : title ? (
            <h3 className="min-w-0 truncate text-xs font-medium text-sidebar-foreground/70">
              {title}
            </h3>
          ) : (
            <span />
          )}
          {headerAction ? (
            <span className={SECTION_ACTION_VISIBILITY_CLASS}>
              {headerAction}
            </span>
          ) : null}
        </div>
      ) : null}
      {!collapsible || expanded ? children : null}
    </section>
  );
}

function ContextRowContent({
  children,
  count,
  icon,
}: {
  children: React.ReactNode;
  count?: number;
  icon: React.ReactNode;
}) {
  return (
    <>
      <span className="flex size-4 shrink-0 items-center justify-center text-current">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      <span className="w-8 shrink-0 text-right tabular-nums text-current opacity-60">
        {count ?? ""}
      </span>
    </>
  );
}

function ContextNavButton({
  children,
  count,
  disabled,
  icon,
  onClick,
  pressed,
  testId,
  title,
}: {
  children: React.ReactNode;
  count?: number;
  disabled?: boolean;
  icon: React.ReactNode;
  onClick?: () => void;
  pressed?: boolean;
  testId?: string;
  title?: string;
}) {
  return (
    <Button
      aria-pressed={pressed}
      className={cn(
        PROJECT_HOME_SIDEBAR_ROW_CLASS,
        pressed &&
          "bg-sidebar-active text-sidebar-active-foreground shadow-xs hover:bg-sidebar-active hover:text-sidebar-active-foreground",
      )}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      size="sm"
      title={title}
      type="button"
      variant="ghost"
    >
      <ContextRowContent count={count} icon={icon}>
        {children}
      </ContextRowContent>
    </Button>
  );
}

function ChannelContextRow({
  channel,
  onClick,
  projectHome,
  testId,
}: {
  channel: Channel;
  onClick?: () => void;
  projectHome?: boolean;
  testId: string;
}) {
  const Icon = projectHome ? ProjectChannelIcon : Hash;
  if (onClick) {
    return (
      <ContextNavButton icon={<Icon />} onClick={onClick} testId={testId}>
        {channel.name}
      </ContextNavButton>
    );
  }
  return (
    <div
      className={`${PROJECT_HOME_SIDEBAR_ROW_CLASS} pointer-events-none flex items-center`}
      data-testid={testId}
    >
      <ContextRowContent icon={<Icon />}>{channel.name}</ContextRowContent>
    </div>
  );
}

export function ProjectHomeContextPanel({
  activeWorkspaceTab,
  channel,
  channels = [],
  identityPubkey,
  onAddRepository,
  onOpenChannel,
  onOpenRepository: _onOpenRepository,
  onOpenWorkspace,
  onRepositoryChange,
  project,
  projects,
  repositoryId = null,
}: {
  activeWorkspaceTab?: ProjectHomeWorkspaceSheetTab | null;
  channel: Channel | null;
  channels?: Channel[];
  identityPubkey?: string;
  onAddRepository?: () => void;
  onOpenChannel?: (channelId: string) => void;
  /** Kept for callers; subrepository clicks no longer fall back here. */
  onOpenRepository?: (repositoryId: string) => void;
  onOpenWorkspace: (repositoryId: string, tab?: EntityLinkTab) => void;
  onRepositoryChange: (repositoryId: string) => void;
  project: Project;
  projects: Project[];
  /** Subrepository channel: tasks, commits, and files use this repo. */
  repositoryId?: string | null;
}) {
  const scopedRepository = repositoryId
    ? (project.repositories.find(
        (repository) => repository.id === repositoryId,
      ) ?? null)
    : null;
  const firstRepository = repositoryId
    ? scopedRepository
    : (project.repositories[0] ?? null);
  const addRepositoryTitle = firstRepository
    ? undefined
    : "Add a repository to this project";
  const openWorkspace = (tab: EntityLinkTab) => {
    if (firstRepository) {
      onOpenWorkspace(firstRepository.id, tab);
      return;
    }
    onAddRepository?.();
  };
  const peopleCount = new Set([
    project.owner,
    ...project.repositories.flatMap((repository) => repository.contributors),
  ]).size;
  const activityProjects = React.useMemo(() => {
    if (!scopedRepository) return [project];
    return [
      {
        ...project,
        id: `${project.id}:${scopedRepository.id}`,
        repositories: [scopedRepository],
      },
    ];
  }, [project, scopedRepository]);
  const activityQuery = useProjectActivitySummariesQuery(activityProjects);
  const activityProjectId = activityProjects[0]?.id;
  const activity = activityProjectId
    ? activityQuery.data?.[activityProjectId]
    : undefined;
  const hulaGit = Boolean(project.hulaPath);
  const hulaSnapshots = useHulaRepositorySnapshots(
    project.repositories,
    hulaGit,
  );
  const repoStateQuery = useRepoStateQuery(firstRepository, !hulaGit);
  const defaultBranch = firstRepository
    ? resolveProjectDefaultBranch(
        firstRepository.defaultBranch,
        repoStateQuery.data,
      )
    : null;
  const snapshotQuery = useProjectRepoSnapshotQuery(
    firstRepository,
    defaultBranch,
    null,
    null,
    Boolean(firstRepository) && !hulaGit,
  );
  const hulaCommitRows = repositoryId
    ? hulaSnapshots.filter((row) => row.repository.id === repositoryId)
    : hulaSnapshots;
  const hulaCommitCount = hulaCommitRows.reduce(
    (sum, row) => sum + (row.snapshot?.commits.length ?? 0),
    0,
  );
  const hulaFileCount = hulaSnapshots.find(
    (row) => row.repository.id === firstRepository?.id,
  )?.snapshot?.files.length;
  const channelsById = new Map(
    channels.map((candidate) => [candidate.id, candidate]),
  );
  const boundChannels = listProjectBoundChannels(project).flatMap((binding) => {
    const boundChannel = channelsById.get(binding.channelId);
    if (!boundChannel) return [];
    return [{ ...binding, channel: boundChannel }];
  });
  const listedChannels =
    boundChannels.length > 0
      ? boundChannels
      : channel
        ? [
            {
              channel,
              channelId: channel.id,
              repositoryId: null,
              role: "home" as const,
            },
          ]
        : [];

  const subRepositories = projectChannelSubRepositories(project);
  const repositoryManagement = (
    <ProjectRepositoryManagement
      compact
      identityPubkey={identityPubkey}
      onChange={onRepositoryChange}
      project={project}
      projects={projects}
    />
  );
  const openSubrepositoryChannel = (
    repository: (typeof subRepositories)[number],
  ) => {
    // Same bound-channel lookup as the Projects tree: prefer a project copy
    // that stores a distinct buzz-channel for this repo address.
    const channelProject =
      (hasAuthoritativeHomeBinding(project) ? project : null) ??
      projects.find(
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
    const fullRepository =
      project.repositories.find((item) => item.id === repository.id) ??
      channelProject.repositories.find(
        (item) => item.repoAddress === repository.repoAddress,
      );
    if (!fullRepository) {
      console.warn(
        `No repository ${repository.id} on project ${project.id}; cannot open subrepository channel.`,
      );
      return;
    }
    const open = repositoryRowOpenTarget({
      projectChannelId: channelProject.projectChannelId,
      projectId: channelProject.id,
      repositoryChannelId: bound.channelId ?? repository.channelId,
      role: repositoryRowRole({ project, repository: fullRepository }),
    });
    if (open.target?.kind === "repository-channel" && onOpenChannel) {
      onOpenChannel(open.target.channelId);
      return;
    }
    if (open.missingSubchannel || !open.target) {
      console.warn(
        `No buzz-channel for subrepository ${bound.repoAddress} (repo id ${bound.id}); cannot open its channel.`,
      );
      return;
    }
    // Mainline / unlabeled should not appear under Subrepositories; still
    // refuse the old Overview path if they do.
    console.warn(
      `Subrepository row ${bound.repoAddress} resolved to ${open.target.kind}; refusing parent/overview fallback.`,
    );
  };
  const checkoutWork = useCheckoutWorkContext();
  return (
    <div
      className="space-y-4 px-2 pb-8 pt-3"
      data-testid="project-home-context-panel"
    >
      {checkoutWork?.rail ? (
        <CheckoutWorkRail
          error={checkoutWork.rail.error}
          isLoading={checkoutWork.rail.isLoading}
          missingCheckout={checkoutWork.rail.missingCheckout}
          onOpenCommit={checkoutWork.onOpenCommit}
          work={checkoutWork.rail.work}
        />
      ) : null}
      <ContextSection testId="project-home-context-workspace">
        <ContextNavButton
          count={presentContextCount(activity?.issueCount)}
          disabled={!firstRepository && !onAddRepository}
          icon={<CircleDot />}
          onClick={() => openWorkspace("issues")}
          pressed={activeWorkspaceTab === "issues"}
          testId="project-home-context-tasks"
          title={addRepositoryTitle}
        >
          Tasks
        </ContextNavButton>
        <ContextNavButton
          count={presentContextCount(
            hulaGit ? hulaCommitCount : activity?.commitCount,
          )}
          disabled={!firstRepository && !onAddRepository}
          icon={<GitCommitHorizontal />}
          onClick={() => openWorkspace("commits")}
          pressed={activeWorkspaceTab === "commits"}
          testId="project-home-context-commits"
          title={addRepositoryTitle}
        >
          Commits
        </ContextNavButton>
        <ContextNavButton
          count={presentContextCount(
            hulaGit ? hulaFileCount : snapshotQuery.data?.files.length,
          )}
          disabled={!firstRepository && !onAddRepository}
          icon={<FileCode2 />}
          onClick={() => openWorkspace("files")}
          pressed={activeWorkspaceTab === "files"}
          testId="project-home-context-files"
          title={addRepositoryTitle}
        >
          Files
        </ContextNavButton>
        <ContextNavButton
          count={presentContextCount(peopleCount)}
          disabled={!firstRepository}
          icon={<Users />}
          onClick={() =>
            firstRepository &&
            onOpenWorkspace(firstRepository.id, "contributors")
          }
          pressed={activeWorkspaceTab === "contributors"}
          testId="project-home-context-people"
          title={addRepositoryTitle}
        >
          People
        </ContextNavButton>
      </ContextSection>
      <ContextSection
        collapsible
        headerAction={
          <ProjectChannelManagement
            identityPubkey={identityPubkey}
            project={project}
          />
        }
        testId="project-home-context-channel"
        title="Channels"
      >
        {listedChannels.length > 0 ? (
          listedChannels.map((binding) => {
            const isHome = binding.role === "home";
            return (
              <ChannelContextRow
                channel={binding.channel}
                key={`${binding.role}:${binding.channel.id}`}
                onClick={
                  isHome || !onOpenChannel
                    ? undefined
                    : () => onOpenChannel(binding.channel.id)
                }
                projectHome={isHome}
                testId={
                  isHome
                    ? "project-home-context-home-channel"
                    : `project-home-context-channel-${binding.channel.name}`
                }
              />
            );
          })
        ) : (
          <p
            className={`${PROJECT_HOME_SIDEBAR_ROW_CLASS} pointer-events-none flex items-center`}
          >
            <ContextRowContent icon={<Hash />}>Unavailable</ContextRowContent>
          </p>
        )}
      </ContextSection>
      {subRepositories.length > 0 ? (
        <ContextSection
          collapsible
          headerAction={repositoryManagement}
          testId="project-home-context-codebase"
          title="Subrepositories"
        >
          {subRepositories.map((repository) => (
            <ContextNavButton
              icon={<FolderGit2 />}
              key={repository.id}
              onClick={() => openSubrepositoryChannel(repository)}
              testId={`project-home-context-repo-${repository.dtag}`}
            >
              {repository.name}
            </ContextNavButton>
          ))}
        </ContextSection>
      ) : (
        <div
          className="group/sidebar-section flex h-8 items-center justify-end px-2"
          data-testid="project-home-repository-actions"
        >
          <span className={SECTION_ACTION_VISIBILITY_CLASS}>
            {repositoryManagement}
          </span>
        </div>
      )}
    </div>
  );
}
