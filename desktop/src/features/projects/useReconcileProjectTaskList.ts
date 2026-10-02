import * as React from "react";

import { projectTaskListMissesActivityCount } from "./lib/projectTaskListFreshness";

/**
 * Refetches the tasks list once when the rail count is ahead of the loaded
 * rows. Returns true only while an empty list is waiting for that read, so
 * the page shows a spinner instead of "No tasks yet".
 */
export function useReconcileProjectTaskList({
  issueCount,
  loadedIssueCount,
  refetch,
}: {
  issueCount: number | null | undefined;
  loadedIssueCount: number | null | undefined;
  refetch: () => Promise<unknown>;
}): boolean {
  const misses = projectTaskListMissesActivityCount(
    issueCount,
    loadedIssueCount,
  );
  const key = misses ? `${issueCount}:${loadedIssueCount}` : null;
  const [settledKey, setSettledKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!key || settledKey === key) return;
    let cancelled = false;
    const settle = () => {
      if (!cancelled) setSettledKey(key);
    };
    void refetch().then(settle, settle);
    return () => {
      cancelled = true;
    };
  }, [key, refetch, settledKey]);

  return key != null && settledKey !== key && loadedIssueCount === 0;
}
