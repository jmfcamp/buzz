import type { ProjectIssueStatus } from "@/features/projects/projectIssues.mjs";

/** Visible task status. Protocol statuses stay on the event. */
export type TaskStatusWord = "queued" | "in progress" | "done";

export const TASK_STATUS_WORDS: readonly TaskStatusWord[] = [
  "queued",
  "in progress",
  "done",
];

export function taskStatusWord(status: ProjectIssueStatus): TaskStatusWord {
  if (status === "Done" || status === "Closed") return "done";
  if (status === "In Progress" || status === "In Review") return "in progress";
  return "queued";
}

/** Collapse protocol statuses into the three words people see. */
export function groupByTaskStatus<T extends { status: ProjectIssueStatus }>(
  items: readonly T[],
): { word: TaskStatusWord; items: T[] }[] {
  return TASK_STATUS_WORDS.map((word) => ({
    word,
    items: items.filter((item) => taskStatusWord(item.status) === word),
  })).filter((group) => group.items.length > 0);
}

/** Done tasks are viewed. Every other word opens the task. */
export function taskNextStepLabel(status: ProjectIssueStatus): string {
  return taskStatusWord(status) === "done" ? "View task" : "Open task";
}

/** Search results only carry `isAgent`. Humans are not task assignees. */
export function isTaskAssigneeCandidate(user: { isAgent?: boolean }): boolean {
  return user.isAgent === true;
}

/** Assign to me is only for a viewer whose profile says they are an agent. */
export function viewerCanSelfAssignTask(
  profile: { isAgent?: boolean } | null | undefined,
): boolean {
  return profile?.isAgent === true;
}
