import { useMutation, useQueryClient } from "@tanstack/react-query";

import { channelMembersQueryKey } from "@/features/channels/rosterFreshness";
import type { Project } from "@/features/projects/projectModels";
import { projectsQueryKey } from "@/features/projects/projectDeletionMutation";
import { markProjectDataAuthoritative } from "@/features/projects/projectSnapshot";
import { publishProjectCodingAgent } from "@/features/projects/syncHulaRepositories";

/**
 * Save a chosen coding agent. The announcement write replaces `coding-agent`
 * only, and the channel add does not publish the project, so `dri` is kept.
 */
export function useSetProjectCodingAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      codingAgentPubkey,
      project,
    }: {
      codingAgentPubkey: string;
      project: Project;
    }) => publishProjectCodingAgent(project, codingAgentPubkey),
    onSuccess: (codingAgent, { project }) => {
      const next = { ...project, codingAgent };
      markProjectDataAuthoritative(next, "local-write");
      queryClient.setQueryData<Project[]>(projectsQueryKey, (current = []) =>
        current.map((candidate) =>
          candidate.id === project.id
            ? { ...candidate, codingAgent }
            : candidate,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      if (project.projectChannelId) {
        void queryClient.invalidateQueries({
          queryKey: channelMembersQueryKey(project.projectChannelId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["managed-agents"] });
    },
  });
}
