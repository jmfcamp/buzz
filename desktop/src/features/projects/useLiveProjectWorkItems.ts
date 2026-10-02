import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { useProjectsQuery } from "@/features/projects/hooks";
import {
  isProjectWorkItemQueryKey,
  projectWorkItemEventMatchesAddresses,
  projectWorkItemLiveFilter,
  projectWorkItemRepoAddresses,
} from "@/features/projects/lib/projectWorkItemLive";
import { relayClient } from "@/shared/api/relayClient";
import type { RelaySubscriptionFilter } from "@/shared/api/relayClientShared";
import type { RelayEvent } from "@/shared/api/types";

const LIVE_RETRY_BASE_MS = 1_000;
const LIVE_RETRY_MAX_MS = 30_000;

export const PROJECT_WORK_ITEM_LIVE_REFRESH_MS = 300;

type SubscribeLive = (
  filter: RelaySubscriptionFilter,
  onEvent: (event: RelayEvent) => void,
) => Promise<() => Promise<void>>;

function subscribeToProjectWorkItems(
  filter: RelaySubscriptionFilter,
  onEvent: (event: RelayEvent) => void,
) {
  return relayClient.subscribeLive(filter, onEvent);
}

type RepositorySource = {
  repositories: readonly { repoAddress: string }[];
};

/**
 * Refreshes open task and review queries when an agent publishes a task or
 * moves one. A short quiet period folds a burst of status events into one read.
 */
export function useLiveProjectWorkItemSubscription(
  projects: readonly RepositorySource[] | undefined,
  options?: {
    refreshDelayMs?: number;
    subscribeLive?: SubscribeLive;
  },
): void {
  const queryClient = useQueryClient();
  const addressKey = projectWorkItemRepoAddresses(projects ?? []).join("\n");
  const refreshDelayMs =
    options?.refreshDelayMs ?? PROJECT_WORK_ITEM_LIVE_REFRESH_MS;
  const subscribeLive = options?.subscribeLive ?? subscribeToProjectWorkItems;

  React.useEffect(() => {
    const repoAddresses = addressKey.length === 0 ? [] : addressKey.split("\n");
    if (repoAddresses.length === 0) return;

    const addresses = new Set(repoAddresses);
    let cancelled = false;
    let dispose: (() => Promise<void>) | null = null;
    let refreshTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let retryAttempt = 0;

    const refresh = () => {
      if (refreshTimer != null) globalThis.clearTimeout(refreshTimer);
      refreshTimer = globalThis.setTimeout(() => {
        refreshTimer = null;
        if (cancelled) return;
        void queryClient.invalidateQueries({
          predicate: (query) => isProjectWorkItemQueryKey(query.queryKey),
        });
      }, refreshDelayMs);
    };

    const start = () => {
      if (cancelled) return;
      void subscribeLive(projectWorkItemLiveFilter(repoAddresses), (event) => {
        if (!projectWorkItemEventMatchesAddresses(event, addresses)) return;
        refresh();
      })
        .then((unsubscribe) => {
          if (cancelled) {
            void unsubscribe();
            return;
          }
          retryAttempt = 0;
          dispose = unsubscribe;
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          console.error("Could not subscribe to live project tasks", error);
          const delay = Math.min(
            LIVE_RETRY_MAX_MS,
            LIVE_RETRY_BASE_MS * 2 ** Math.min(retryAttempt, 5),
          );
          retryAttempt += 1;
          retryTimer = globalThis.setTimeout(start, delay);
        });
    };

    start();

    return () => {
      cancelled = true;
      if (refreshTimer != null) globalThis.clearTimeout(refreshTimer);
      if (retryTimer != null) globalThis.clearTimeout(retryTimer);
      if (dispose) void dispose();
    };
  }, [addressKey, queryClient, refreshDelayMs, subscribeLive]);
}

/** Session-long task subscription. The tasks page hides the rail, so the rail cannot own this. */
export function useLiveProjectWorkItems(): void {
  const projectsQuery = useProjectsQuery();
  useLiveProjectWorkItemSubscription(projectsQuery.data);
}
