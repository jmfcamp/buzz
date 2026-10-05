import { useSearch } from "@tanstack/react-router";
import { Maximize2, Plus } from "lucide-react";
import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useChannelsQuery } from "@/features/channels/hooks";
import { ChannelScreenLoadingFallback } from "@/features/channels/ui/ChannelScreenLoadingFallback";
import { useProfileQuery } from "@/features/profile/hooks";
import type { Project } from "@/features/projects/hooks";
import { hasAuthoritativeHomeBinding } from "@/features/projects/lib/projectHomeChannel";
import {
  isProjectHomeWorkspaceSheetTab,
  projectHomeWorkspaceSheetExpandTab,
  projectHomeWorkspaceSheetTitle,
  type ProjectHomeWorkspaceSheetTab,
} from "@/features/projects/lib/projectHomeWorkspaceSheet";
import {
  repositoryRowOpenTarget,
  repositoryRowRole,
} from "@/features/projects/lib/repositoryListRoles";
import { ProjectSelectionProvider } from "@/features/projects/lib/useProjectSelection";
import { useHealProjectHomeRepositories } from "@/features/projects/useHealProjectHomeRepositories";
import { useIdentityQuery } from "@/shared/api/hooks";
import type { RelayEvent } from "@/shared/api/types";
import type { EntityLinkTab } from "@/shared/lib/entityLink";
import { useThreadPanelWidth } from "@/shared/hooks/useThreadPanelWidth";
import { SIDEBAR_WIDTH_MIN } from "@/shared/layout/sidebarLayout";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { DrawerPanelIcon } from "@/shared/ui/DrawerPanelIcon";
import { useOptionalSidebar } from "@/shared/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { Tabs } from "@/shared/ui/tabs";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";
import { ProjectChannelPrimaryCodebase } from "./ProjectChannelPrimaryCodebase";
import { ProjectChannelWorkspace } from "./ProjectChannelWorkspace";
import { ProjectChannelSectionList } from "./ProjectWorkspaceTabList";
import { PROJECT_COLUMN_HEADER_BACKDROP_CLASS } from "./projectPanelStyles";
import { ProjectContextRail } from "./ProjectContextRail";
import { ProjectDetailChrome } from "./ProjectDetailChrome";
import { ProjectHomeColumn } from "./ProjectHomeColumn";
import type { CheckoutFilesBrowseTarget } from "@/features/projects/lib/checkoutWork";
import { CheckoutWorkProvider } from "./checkoutWorkContext";
import { ProjectHomeContextPanel } from "./ProjectHomeContextPanel";
import {
  ProjectHomeWorkspaceSheet,
  type ProjectHomeWorkspaceCreateAction,
  type ProjectHomeWorkspaceDetail,
} from "./ProjectHomeWorkspaceSheet";
import { ProjectRepositoryManagement } from "./ProjectRepositoryManagement";

const EMPTY_TARGET_MESSAGE_EVENTS: RelayEvent[] = [];
const PROJECT_HOME_SUMMARY_WIDTH_KEY =
  "buzz.desktop.project-home-summary-width";

const ChannelScreenView = React.lazy(async () => {
  const module = await import("@/features/channels/ui/ChannelScreen");
  return { default: module.ChannelScreen };
});

function ignoreForumPost() {}
function ignoreForumPostSelect() {}

function ProjectHomeHeaderToggle({
  children,
  label,
  onClick,
  open,
  testId,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  open: boolean;
  testId: string;
}) {
  return (
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>
        <Button
          aria-label={open ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={open}
          className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent"
          data-testid={testId}
          onClick={onClick}
          size="icon"
          title={label}
          type="button"
          variant="ghost"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ProjectChannelHome({
  allowRepositoryHealing,
  autoSendDraftKey,
  project,
  projects,
  scopedRepositoryId = null,
  targetMessageEvents = EMPTY_TARGET_MESSAGE_EVENTS,
  targetMessageId,
}: {
  allowRepositoryHealing: boolean;
  autoSendDraftKey?: string | null;
  project: Project;
  projects: Project[];
  /**
   * Repository whose buzz-channel is the open channel.
   * Checkout, commits, and files follow it. Chat stays on that channel.
   * Null is the project home, which keeps the primary repository.
   */
  scopedRepositoryId?: string | null;
  targetMessageEvents?: RelayEvent[];
  targetMessageId?: string | null;
}) {
  const { goChannel, goProject, goProjects } = useAppNavigation();
  const sidebar = useOptionalSidebar();
  const identityQuery = useIdentityQuery();
  const profileQuery = useProfileQuery();
  const channelsQuery = useChannelsQuery();
  const search = useSearch({ strict: false }) as {
    autoSend?: string;
    messageId?: string;
  };
  const [summaryOpen, setSummaryOpen] = React.useState(true);
  const [section, setSection] = React.useState("chat");
  const [sectionRepositoryId, setSectionRepositoryId] = React.useState<
    string | null
  >(scopedRepositoryId);
  const [addRepositoryOpen, setAddRepositoryOpen] = React.useState(false);
  const [workspaceSheetTab, setWorkspaceSheetTab] =
    React.useState<ProjectHomeWorkspaceSheetTab | null>(null);
  const [workspaceRepositoryId, setWorkspaceRepositoryId] = React.useState<
    string | null
  >(scopedRepositoryId);
  const [workspaceCreateAction, setWorkspaceCreateAction] =
    React.useState<ProjectHomeWorkspaceCreateAction | null>(null);
  const [workspaceDetail, setWorkspaceDetail] =
    React.useState<ProjectHomeWorkspaceDetail | null>(null);
  /** Files sheet opened from checkout rail — browse that selection's tree. */
  const [checkoutFilesBrowse, setCheckoutFilesBrowse] =
    React.useState<CheckoutFilesBrowseTarget | null>(null);
  const summaryWidth = useThreadPanelWidth(undefined, {
    minWidthPx: SIDEBAR_WIDTH_MIN,
    sessionKey: PROJECT_HOME_SUMMARY_WIDTH_KEY,
  });
  const scopedRepository =
    scopedRepositoryId == null
      ? null
      : (project.repositories.find(
          (repository) => repository.id === scopedRepositoryId,
        ) ?? null);
  const chatChannelId = scopedRepository?.channelId ?? project.projectChannelId;
  const homeChannel =
    channelsQuery.data?.find((channel) => channel.id === chatChannelId) ?? null;
  const waitingForChannel = channelsQuery.isPending && !homeChannel;
  const workspaceRepository =
    project.repositories.find(
      (repository) => repository.id === workspaceRepositoryId,
    ) ??
    scopedRepository ??
    project.repositories[0] ??
    null;
  const workspaceSheetOpen =
    workspaceSheetTab != null && workspaceRepository != null;
  const previousWorkspaceSheetOpenRef = React.useRef(workspaceSheetOpen);
  const workspaceSheetVisibilityChanged =
    previousWorkspaceSheetOpenRef.current !== workspaceSheetOpen;
  React.useEffect(() => {
    previousWorkspaceSheetOpenRef.current = workspaceSheetOpen;
  }, [workspaceSheetOpen]);
  const summaryVisible =
    summaryOpen && (section !== "chat" || !workspaceSheetOpen);
  const selectSection = React.useCallback((next: string) => {
    if (next !== "chat") {
      setWorkspaceCreateAction(null);
      setWorkspaceDetail(null);
      setCheckoutFilesBrowse(null);
      setWorkspaceSheetTab(null);
    }
    setSection(next);
  }, []);
  const handleOpenPrimaryCodebase = React.useCallback(
    (repositoryId: string) => {
      setSectionRepositoryId(repositoryId);
      selectSection("chat");
    },
    [selectSection],
  );
  const projectId = project.id;
  React.useEffect(() => {
    if (!projectId) return;
    setSection("chat");
    setSectionRepositoryId(scopedRepositoryId);
    setWorkspaceRepositoryId(scopedRepositoryId);
  }, [projectId, scopedRepositoryId]);

  const openWorkspaceSheet = React.useCallback(
    (tab: ProjectHomeWorkspaceSheetTab, repositoryId?: string) => {
      if (repositoryId) {
        setWorkspaceRepositoryId(repositoryId);
      }
      setWorkspaceCreateAction(null);
      setWorkspaceDetail(null);
      if (tab !== "files") {
        setCheckoutFilesBrowse(null);
      }
      setWorkspaceSheetTab((current) => (current === tab ? null : tab));
    },
    [],
  );
  const closeWorkspaceSheet = React.useCallback(() => {
    setWorkspaceCreateAction(null);
    setWorkspaceDetail(null);
    setCheckoutFilesBrowse(null);
    setWorkspaceSheetTab(null);
  }, []);
  const handleOpenCheckoutFiles = React.useCallback(
    (target: CheckoutFilesBrowseTarget) => {
      setCheckoutFilesBrowse(target);
      if (workspaceRepository?.id) {
        setWorkspaceRepositoryId(workspaceRepository.id);
      }
      setWorkspaceCreateAction(null);
      setWorkspaceDetail(null);
      setWorkspaceSheetTab("files");
    },
    [workspaceRepository?.id],
  );
  const handleOpenWorkspace = React.useCallback(
    (repositoryId: string, tab?: EntityLinkTab) => {
      if (!isProjectHomeWorkspaceSheetTab(tab)) {
        void goProject(project.id, { repositoryId, tab });
        return;
      }
      openWorkspaceSheet(tab, repositoryId);
    },
    [goProject, openWorkspaceSheet, project.id],
  );
  const handleOpenRepository = React.useCallback(
    (repositoryId: string) => {
      // Subrepositories on the channel rail open the buzz-channel bound to
      // that repo, the same target as the Projects tree. Never the old
      // repository workspace (goProject with a repositoryId) and never the
      // parent project channel as a fallback.
      const repository =
        project.repositories.find((item) => item.id === repositoryId) ?? null;
      if (!repository) {
        console.warn(
          `No repository ${repositoryId} on project ${project.id}; cannot open.`,
        );
        return;
      }
      // Same bound-channel lookup the Projects tree uses when a legacy row
      // lacks a home binding but another project copy stores the buzz-channel.
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
      const open = repositoryRowOpenTarget({
        projectChannelId: channelProject.projectChannelId,
        projectId: channelProject.id,
        repositoryChannelId: bound.channelId ?? repository.channelId,
        role: repositoryRowRole({ project, repository }),
      });
      if (open.missingSubchannel || !open.target) {
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
    [goChannel, goProject, project, projects],
  );
  const handleRepositoryChange = React.useCallback(() => {
    void goProject(project.id);
  }, [goProject, project.id]);
  const handleAddFiles = React.useCallback(() => {
    setAddRepositoryOpen(true);
  }, []);
  const handleFilesAdded = React.useCallback((repositoryId: string) => {
    setWorkspaceCreateAction(null);
    setWorkspaceDetail(null);
    setCheckoutFilesBrowse(null);
    setWorkspaceRepositoryId(repositoryId);
    setWorkspaceSheetTab("files");
  }, []);
  const handleWorkspaceRepositoryChange = React.useCallback(
    (repositoryId: string) => {
      setWorkspaceCreateAction(null);
      setWorkspaceDetail(null);
      setWorkspaceRepositoryId(repositoryId);
    },
    [],
  );
  useHealProjectHomeRepositories(
    project,
    allowRepositoryHealing,
    identityQuery.data?.pubkey,
  );
  const handleOpenCommit = React.useCallback(
    (commitHash: string) => {
      if (!workspaceRepository) return;
      void goProject(project.id, {
        commitHash,
        repositoryId: workspaceRepository.id,
        tab: "commits",
      });
    },
    [goProject, project.id, workspaceRepository],
  );
  const handleExpandWorkspace = React.useCallback(() => {
    if (!workspaceRepository || !workspaceSheetTab) return;
    void goProject(project.id, {
      repositoryId: workspaceRepository.id,
      ...workspaceDetail?.navigation,
      tab: projectHomeWorkspaceSheetExpandTab(workspaceSheetTab),
    });
  }, [
    goProject,
    project.id,
    workspaceDetail?.navigation,
    workspaceRepository,
    workspaceSheetTab,
  ]);
  const expandLabel = workspaceSheetTab
    ? `Open ${projectHomeWorkspaceSheetTitle(workspaceSheetTab)} in repository`
    : "Open in repository";
  const workspaceSheet =
    workspaceSheetOpen && workspaceSheetTab && workspaceRepository ? (
      <ProjectHomeWorkspaceSheet
        key={`${workspaceSheetTab}:${workspaceRepository.id}:${checkoutFilesBrowse?.root ?? ""}:${checkoutFilesBrowse?.gitRef ?? ""}`}
        filesContext={checkoutFilesBrowse?.context}
        filesGitRef={checkoutFilesBrowse?.gitRef}
        filesRoot={checkoutFilesBrowse?.root}
        identityPubkey={identityQuery.data?.pubkey}
        onCreateActionChange={setWorkspaceCreateAction}
        onDetailChange={setWorkspaceDetail}
        onOpenCommit={handleOpenCommit}
        onRepositoryAdded={handleFilesAdded}
        onSelectRepository={handleWorkspaceRepositoryChange}
        project={project}
        projects={projects}
        repository={workspaceRepository}
        tab={workspaceSheetTab}
      />
    ) : null;

  return (
    <CheckoutWorkProvider
      channelId={chatChannelId}
      onOpenCommit={handleOpenCommit}
      onOpenFiles={handleOpenCheckoutFiles}
      project={project}
      repository={scopedRepository}
    >
      <ProjectSelectionProvider
        resetKey={`${project.id}:${workspaceSheetTab ?? "home"}`}
      >
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          data-project-context-detached={summaryVisible ? "true" : undefined}
          data-project-detail-screen
          data-repository-healing-enabled={allowRepositoryHealing}
          data-scoped-repository-id={scopedRepository?.id}
          data-testid="project-channel-home"
        >
          <ProjectDetailChrome
            actions={
              <ProjectHomeHeaderToggle
                label="Overview"
                onClick={() => {
                  if (workspaceSheetOpen) {
                    closeWorkspaceSheet();
                    return;
                  }
                  setSummaryOpen((open) => !open);
                }}
                open={summaryVisible}
                testId="project-home-drawer-toggle"
              >
                <DrawerPanelIcon
                  className="-scale-x-100"
                  side={summaryVisible ? "left" : "right"}
                />
              </ProjectHomeHeaderToggle>
            }
            activeTabCrumb={null}
            activeWorkItemCrumb={null}
            onGoProjectHome={() => {
              if (project.projectChannelId) {
                void goChannel(project.projectChannelId);
                return;
              }
              void goProject(project.id);
            }}
            onGoProjects={() => {
              void goProjects();
            }}
            project={project}
            repository={scopedRepository}
            rounded={summaryVisible}
          />
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 overflow-hidden pt-2",
              summaryVisible && "bg-sidebar pr-2",
              summaryVisible && sidebar?.open === false && "pl-2",
            )}
          >
            <div
              className={cn(
                "relative flex min-h-0 min-w-60 flex-1 flex-col overflow-hidden",
                summaryVisible
                  ? "mb-2 ml-px rounded-2xl bg-background"
                  : "bg-muted/20",
              )}
            >
              <div
                className={`flex h-10 shrink-0 items-center overflow-hidden border-b border-border/60 px-4 ${PROJECT_COLUMN_HEADER_BACKDROP_CLASS}`}
                data-testid="project-channel-identity"
              >
                <ProjectChannelPrimaryCodebase
                  onOpenRepository={handleOpenPrimaryCodebase}
                  project={project}
                  repository={scopedRepository ?? undefined}
                />
              </div>
              <Tabs
                className={`flex h-13 shrink-0 items-center overflow-hidden px-4 ${PROJECT_COLUMN_HEADER_BACKDROP_CLASS}`}
                data-testid="project-channel-sections"
                onValueChange={selectSection}
                value={section}
              >
                <ProjectChannelSectionList />
              </Tabs>
              {section !== "chat" ? (
                <ProjectChannelWorkspace
                  onSectionChange={selectSection}
                  onSelectRepository={(repositoryId) => {
                    setSectionRepositoryId(repositoryId);
                    selectSection("overview");
                  }}
                  project={project}
                  repositoryId={sectionRepositoryId}
                  section={section}
                />
              ) : waitingForChannel ? (
                <ViewLoadingFallback kind="channel" />
              ) : homeChannel ? (
                <React.Suspense
                  fallback={
                    <ChannelScreenLoadingFallback isHuddleTranscript={false} />
                  }
                >
                  <ChannelScreenView
                    activeChannel={homeChannel}
                    autoSendDraftKey={
                      autoSendDraftKey === undefined
                        ? (search.autoSend ?? null)
                        : autoSendDraftKey
                    }
                    currentIdentity={identityQuery.data}
                    currentProfile={profileQuery.data}
                    idleAuxiliaryPanel={workspaceSheet}
                    idleAuxiliaryHeaderActions={{
                      actions: (
                        <>
                          {workspaceCreateAction ? (
                            <Tooltip disableHoverableContent>
                              <TooltipTrigger asChild>
                                <Button
                                  aria-label={workspaceCreateAction.label}
                                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                                  data-testid="project-home-workspace-sheet-create"
                                  disabled={workspaceCreateAction.disabled}
                                  onClick={workspaceCreateAction.onClick}
                                  size="icon"
                                  title={
                                    workspaceCreateAction.title ??
                                    workspaceCreateAction.label
                                  }
                                  type="button"
                                  variant="ghost"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {workspaceCreateAction.label}
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                          <Tooltip disableHoverableContent>
                            <TooltipTrigger asChild>
                              <Button
                                aria-label={expandLabel}
                                className="shrink-0"
                                data-testid="project-home-workspace-sheet-expand"
                                onClick={handleExpandWorkspace}
                                size="icon"
                                title={expandLabel}
                                type="button"
                                variant="ghost"
                              >
                                <Maximize2 />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{expandLabel}</TooltipContent>
                          </Tooltip>
                        </>
                      ),
                      backLabel: workspaceDetail?.backLabel,
                      onBack: workspaceDetail?.onBack,
                    }}
                    idleAuxiliaryOverridesThread={workspaceSheetOpen}
                    idleAuxiliaryTitle={
                      workspaceSheetTab
                        ? projectHomeWorkspaceSheetTitle(workspaceSheetTab)
                        : ""
                    }
                    onCloseIdleAuxiliaryPanel={closeWorkspaceSheet}
                    onCloseForumPost={ignoreForumPost}
                    onSelectForumPost={ignoreForumPostSelect}
                    selectedForumPostId={null}
                    targetForumReplyId={null}
                    targetMessageEvents={targetMessageEvents}
                    targetMessageId={
                      targetMessageId === undefined
                        ? (search.messageId ?? null)
                        : targetMessageId
                    }
                  />
                </React.Suspense>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8">
                  <p className="text-sm text-muted-foreground">
                    This project's channel could not be found.
                  </p>
                </div>
              )}
            </div>
            <ProjectRepositoryManagement
              createOpen={addRepositoryOpen}
              hideTriggers
              identityPubkey={identityQuery.data?.pubkey}
              onChange={handleFilesAdded}
              onCreateOpenChange={setAddRepositoryOpen}
              project={project}
              projects={projects}
            />
            <ProjectContextRail
              animateWidth={!workspaceSheetVisibilityChanged}
              open={summaryVisible}
              panelWidthPx={summaryWidth.widthPx}
              resizing={summaryWidth.isResizing}
              rounded={false}
              testId="project-home-summary-rail"
            >
              {summaryVisible ? (
                <ProjectHomeColumn
                  bodyClassName="overflow-y-auto overflow-x-hidden overscroll-contain"
                  canResetWidth={summaryWidth.canReset}
                  onResetWidth={summaryWidth.onResetWidth}
                  onResizeStart={summaryWidth.onResizeStart}
                  testId="project-home-summary-column"
                  widthPx={summaryWidth.widthPx}
                >
                  <ProjectHomeContextPanel
                    activeWorkspaceTab={workspaceSheetTab}
                    channel={homeChannel}
                    channels={channelsQuery.data ?? []}
                    identityPubkey={identityQuery.data?.pubkey}
                    onAddRepository={handleAddFiles}
                    onOpenChannel={(channelId) => {
                      void goChannel(channelId);
                    }}
                    onOpenRepository={handleOpenRepository}
                    onOpenWorkspace={handleOpenWorkspace}
                    onRepositoryChange={handleRepositoryChange}
                    project={project}
                    projects={projects}
                    repositoryId={scopedRepositoryId}
                  />
                </ProjectHomeColumn>
              ) : null}
            </ProjectContextRail>
          </div>
        </div>
      </ProjectSelectionProvider>
    </CheckoutWorkProvider>
  );
}
