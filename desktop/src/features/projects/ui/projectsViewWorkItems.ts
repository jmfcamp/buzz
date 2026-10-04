import * as React from "react";
import { toast } from "sonner";

import type { Project } from "@/features/projects/hooks";
import { hasLocalRepositoryCheckout } from "@/features/projects/lib/projectLocalRepos";
import { selectProjectRepository } from "@/features/projects/projectModels";
import type { useOpenProjectTerminal } from "@/features/projects/ui/useOpenProjectTerminal";

// Split from ProjectsView.tsx to keep that file under the per-file line cap.

/**
 * Stable empty fallback: a fresh `[]` per render would defeat the memoized
 * activity feed while work items load.
 */
export const EMPTY_ITEMS: never[] = [];

/**
 * Delete-project handler with toast feedback. Depends on the stable
 * mutateAsync, not the per-render mutation object, so memoized card/row
 * trees keep their identity across renders.
 */
export function useDeleteProjectHandler(
  mutateAsync: (project: Project) => Promise<unknown>,
) {
  return React.useCallback(
    async (project: Project) => {
      try {
        await mutateAsync(project);
        toast.success("Project deleted");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete project",
        );
      }
    },
    [mutateAsync],
  );
}

/** Opens the project's selected repository in a terminal (see ProjectsView). */
export function useOpenProjectTerminalHandler(
  openTerminal: ReturnType<typeof useOpenProjectTerminal>,
  localRepoNames: Set<string>,
) {
  return React.useCallback(
    (project: Project) => {
      const repository = selectProjectRepository(project, null);
      if (!repository) return Promise.resolve();
      return openTerminal(repository, {
        // Check the selected repository only — not all members — so the
        // terminal affordance reflects the repository the button will open.
        hasLocalCheckout: hasLocalRepositoryCheckout(
          repository,
          localRepoNames,
        ),
      });
    },
    [localRepoNames, openTerminal],
  );
}
