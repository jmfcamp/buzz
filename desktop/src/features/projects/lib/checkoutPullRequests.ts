import { useQuery } from "@tanstack/react-query";

import {
  parsePullRequests,
  type CheckoutPullRequest,
} from "@/features/projects/lib/checkoutWork";
import { invokeTauri } from "@/shared/api/tauri";
import { useFocusedRefetchInterval } from "@/shared/lib/useDocumentVisible";

/** Load PRs for one `owner/name` repo via the local Mac `gh` Tauri command. */
export async function fetchRepoPullRequests(
  repo: string,
): Promise<CheckoutPullRequest[]> {
  const json = await invokeTauri<string>("gh_pr_list", { repo });
  return parsePullRequests(json);
}

/** Poll GitHub PRs for one `owner/name` repo. Errors become an empty list. */
export function useRepoPullRequests(repo: string | null) {
  const refetchInterval = useFocusedRefetchInterval(60_000);
  return useQuery({
    enabled: Boolean(repo),
    queryKey: ["repo-prs", repo],
    queryFn: async (): Promise<CheckoutPullRequest[]> => {
      if (!repo) return [];
      try {
        return await fetchRepoPullRequests(repo);
      } catch {
        return [];
      }
    },
    refetchInterval,
    staleTime: 60_000,
  });
}
