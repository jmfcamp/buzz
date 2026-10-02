import {
  CircleDot,
  FolderGit2,
  Folders,
  Hash,
  type LucideIcon,
} from "lucide-react";

import type { ProjectsFilter } from "@/features/projects/lib/projectsViewHelpers";

export function projectsSectionTitle(filter: ProjectsFilter) {
  if (filter === "all" || filter === "prs") return "Activity";
  if (filter === "issues") return "Tasks";
  if (filter === "repositories") return "Repositories";
  if (filter === "channels") return "Channels";
  return "Projects";
}

export function projectsSectionIcon(filter: ProjectsFilter): LucideIcon {
  if (filter === "issues") return CircleDot;
  if (filter === "repositories") return FolderGit2;
  if (filter === "channels") return Hash;
  return Folders;
}

export function openAppSearch() {
  document
    .querySelector<HTMLButtonElement>('[data-testid="open-search"]')
    ?.click();
}
