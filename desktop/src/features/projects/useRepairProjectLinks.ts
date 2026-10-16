import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { projectsQueryKey, useProjectHomeForChannelQuery } from "@/features/projects/hooks";
import { syncMissingHulaRepositories } from "@/features/projects/syncHulaRepositories";
import { useIdentityQuery } from "@/shared/api/hooks";
import { relayReadRetry, relayReadRetryDelay } from "@/shared/lib/relayReadRetry";

/**
 * Owner-only "Repair project links" for a Hula project's home channel.
 * Rewrites the project's repo links from live announcements under the project
 * folder (relay only: no workspace listing, never creates repos or channels),
 * so it works on web without Direct.
 */
export function useRepairProjectLinks(channelId: string) {
  const queryClient = useQueryClient();
  const projectQuery = useProjectHomeForChannelQuery(channelId);
  const identityQuery = useIdentityQuery();
  const project = projectQuery.data ?? null;
  const identity = identityQuery.data?.pubkey?.toLowerCase() ?? "";
  const available =
    !!project &&
    !!project.hulaPath &&
    !project.legacy &&
    identity.length > 0 &&
    identity === project.owner.toLowerCase();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!project) throw new Error("This channel is not a project home.");
      return syncMissingHulaRepositories(project, undefined, { linksOnly: true });
    },
    retry: relayReadRetry,
    retryDelay: relayReadRetryDelay,
    onSuccess: (changed) => {
      if (changed > 0) {
        toast.success("Project links repaired.");
        void queryClient.invalidateQueries({ queryKey: projectsQueryKey });
      } else {
        toast("Links already correct.");
      }
    },
    onError: (error) => {
      const text = error instanceof Error ? error.message : String(error);
      toast.error(`Failed: ${text.length > 240 ? `${text.slice(0, 240)}…` : text}`);
    },
  });

  return {
    available,
    pending: mutation.isPending,
    repair: () => mutation.mutate(),
  };
}
