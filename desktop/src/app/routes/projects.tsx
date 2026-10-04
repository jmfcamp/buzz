import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import {
  parseProfilePanelTab,
  parseProfilePanelView,
  type ProfilePanelTab,
  type ProfilePanelView,
} from "@/features/profile/ui/UserProfilePanelUtils";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const ProjectsScreen = React.lazy(async () => {
  const module = await import("@/features/projects/ui/ProjectsScreen");
  return { default: module.ProjectsScreen };
});

type ProjectsRouteSearch = {
  profile?: string;
  profileTab?: ProfilePanelTab;
  profileView?: ProfilePanelView;
};

function validateProjectsSearch(
  search: Record<string, unknown>,
): ProjectsRouteSearch {
  return {
    profile:
      typeof search.profile === "string" && search.profile.length > 0
        ? search.profile
        : undefined,
    profileTab: parseProfilePanelTab(search.profileTab) ?? undefined,
    profileView: parseProfilePanelView(search.profileView) ?? undefined,
  };
}

export const Route = createFileRoute("/projects")({
  component: ProjectsRouteComponent,
  validateSearch: validateProjectsSearch,
});

function ProjectsRouteComponent() {
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="projects" />}>
      <ProjectsScreen />
    </React.Suspense>
  );
}
