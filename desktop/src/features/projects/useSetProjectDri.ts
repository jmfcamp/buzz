import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Project } from "@/features/projects/projectModels";
import { projectsQueryKey } from "@/features/projects/projectDeletionMutation";
import { markProjectDataAuthoritative } from "@/features/projects/projectSnapshot";
import { publishProjectDri } from "@/features/projects/syncHulaRepositories";

/** Save a chosen DRI onto the project announcement. */
export function useSetProjectDriMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      driPubkey,
      project,
    }: {
      driPubkey: string;
      project: Project;
    }) => publishProjectDri(project, driPubkey),
    onSuccess: (dri, { project }) => {
      const next = { ...project, dri };
      markProjectDataAuthoritative(next, "local-write");
      queryClient.setQueryData<Project[]>(projectsQueryKey, (current = []) =>
        current.map((candidate) =>
          candidate.id === project.id ? { ...candidate, dri } : candidate,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
    },
  });
}
