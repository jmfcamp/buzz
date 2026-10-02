/**
 * The tasks rail counts kind 1621 events on its own query. The tasks list
 * can stay fresh and empty after an agent publishes those events. A higher
 * rail count means the list is missing tasks.
 */
export function projectTaskListMissesActivityCount(
  issueCount: number | null | undefined,
  loadedIssueCount: number | null | undefined,
): boolean {
  if (typeof issueCount !== "number" || typeof loadedIssueCount !== "number") {
    return false;
  }
  return issueCount > loadedIssueCount;
}
