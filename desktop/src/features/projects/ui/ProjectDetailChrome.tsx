import { ChevronRight, Folders } from "lucide-react";
import type * as React from "react";

import { AppTopChromePortal } from "@/app/AppTopChromePortal";
import type { Project, Repository } from "@/features/projects/hooks";
import { cn } from "@/shared/lib/cn";
import { useOptionalSidebar } from "@/shared/ui/sidebar";

const CANVAS_CRUMB_LINK_CLASS =
  "min-w-0 truncate rounded-md px-1 py-1 font-medium text-foreground transition-colors hover:bg-background/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";
const CANVAS_CRUMB_CURRENT_CLASS =
  "min-w-0 truncate px-1 font-medium text-muted-foreground";
const CANVAS_CRUMB_SEPARATOR_CLASS = "h-3 w-3 shrink-0 text-muted-foreground";

export type ProjectDetailWorkItemCrumb = {
  category: string;
  title: string;
  clear: () => void;
};

export function ProjectDetailChrome({
  actions,
  activeTabCrumb,
  activeWorkItemCrumb,
  onGoProjectHome,
  onGoProjects,
  project,
  repository,
  rounded = false,
}: {
  /** Controls at the right edge of the breadcrumb band. */
  actions?: React.ReactNode;
  activeTabCrumb: string | null;
  activeWorkItemCrumb: ProjectDetailWorkItemCrumb | null;
  onGoProjectHome: () => void;
  onGoProjects: () => void;
  project: Project;
  repository?: Repository | null;
  /** Paint the band as its own rounded surface, matching the content pods. */
  rounded?: boolean;
}) {
  const sidebar = useOptionalSidebar();
  const sidebarClosed = rounded && sidebar?.open === false;
  const repositoryCrumb = repository ? (
    activeWorkItemCrumb ? (
      <>
        <button
          className={CANVAS_CRUMB_LINK_CLASS}
          data-testid="project-breadcrumb-repository"
          onClick={onGoProjectHome}
          type="button"
        >
          {repository.name}
        </button>
        <ChevronRight className={CANVAS_CRUMB_SEPARATOR_CLASS} />
        <button
          className={`${CANVAS_CRUMB_LINK_CLASS} shrink-0`}
          onClick={activeWorkItemCrumb.clear}
          type="button"
        >
          {activeWorkItemCrumb.category}
        </button>
        <ChevronRight className={CANVAS_CRUMB_SEPARATOR_CLASS} />
        <span aria-current="page" className={CANVAS_CRUMB_CURRENT_CLASS}>
          {activeWorkItemCrumb.title}
        </span>
      </>
    ) : activeTabCrumb ? (
      <>
        <button
          className={CANVAS_CRUMB_LINK_CLASS}
          data-testid="project-breadcrumb-repository"
          onClick={onGoProjectHome}
          type="button"
        >
          {repository.name}
        </button>
        <ChevronRight className={CANVAS_CRUMB_SEPARATOR_CLASS} />
        <span aria-current="page" className={CANVAS_CRUMB_CURRENT_CLASS}>
          {activeTabCrumb}
        </span>
      </>
    ) : (
      <span
        aria-current="page"
        className={CANVAS_CRUMB_CURRENT_CLASS}
        data-testid="project-breadcrumb-repository"
      >
        {repository.name}
      </span>
    )
  ) : null;
  return (
    <div
      className={cn(
        "flex h-13 shrink-0 items-center gap-3 bg-muted px-4",
        rounded
          ? cn(
              "mr-2 mt-px rounded-2xl",
              sidebarClosed ? "ml-[calc(0.5rem+1px)]" : "ml-px",
            )
          : "border-b border-border",
      )}
      data-testid="project-detail-chrome"
    >
      <nav
        aria-label="Project breadcrumb"
        className="flex min-w-0 flex-1 items-center gap-0.5 text-xs"
      >
        <button
          className={`${CANVAS_CRUMB_LINK_CLASS} flex shrink-0 items-center gap-1.5`}
          onClick={onGoProjects}
          type="button"
        >
          <Folders className="h-3.5 w-3.5" />
          Projects
        </button>
        <ChevronRight className={CANVAS_CRUMB_SEPARATOR_CLASS} />
        {repositoryCrumb ? (
          <>
            <button
              className={CANVAS_CRUMB_LINK_CLASS}
              data-testid="project-breadcrumb-project"
              onClick={onGoProjectHome}
              type="button"
            >
              {project.name}
            </button>
            <ChevronRight className={CANVAS_CRUMB_SEPARATOR_CLASS} />
            {repositoryCrumb}
          </>
        ) : (
          <span
            aria-current="page"
            className={CANVAS_CRUMB_CURRENT_CLASS}
            data-testid="project-breadcrumb-project"
          >
            {project.name}
          </span>
        )}
      </nav>
      <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
    </div>
  );
}

const BREADCRUMB_BUTTON_CLASS =
  "flex shrink-0 items-center gap-1.5 rounded-md px-1 py-1 font-medium transition-colors hover:text-sidebar-accent-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

export function ProjectsWorkspaceChrome({
  actions,
  onGoActivity,
  section,
}: {
  actions: React.ReactNode;
  onGoActivity: () => void;
  section: string;
}) {
  const onActivity = section === "Activity";

  return (
    <AppTopChromePortal>
      <div
        className="flex min-w-0 flex-1 items-center justify-between gap-3 pl-2"
        data-tauri-drag-region
        data-testid="projects-workspace-chrome"
      >
        <nav
          aria-label="Projects breadcrumb"
          className="absolute flex max-w-[50%] min-w-0 -translate-x-1/2 -translate-y-px items-center gap-0.5 text-xs text-sidebar-foreground/65 transition-[left] duration-200 ease-linear motion-reduce:transition-none"
          style={{
            left: "calc(50% + var(--app-top-chrome-center-offset, 0rem))",
          }}
        >
          {onActivity ? (
            <span className="flex min-w-0 items-center gap-1.5 px-1 py-1 font-medium">
              <Folders className="h-3.5 w-3.5 shrink-0" />
              Projects
            </span>
          ) : (
            <button
              className={BREADCRUMB_BUTTON_CLASS}
              onClick={onGoActivity}
              type="button"
            >
              <Folders className="h-3.5 w-3.5 shrink-0" />
              Projects
            </button>
          )}
          <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
          <span
            aria-current="page"
            className="min-w-0 truncate px-0.5 font-medium opacity-60"
          >
            {section}
          </span>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {actions}
        </div>
      </div>
    </AppTopChromePortal>
  );
}
