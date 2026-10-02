import type { ProjectRepoCommit } from "@/shared/api/projectGitTypes";

/** Select value that keeps every author. */
export const ALL_COMMIT_AUTHORS = "all";

/** Select value that keeps every repository. */
export const ALL_COMMIT_REPOSITORIES = "all";

/** Select value that keeps every commit date. */
export const ALL_COMMIT_DATES = "all";

/** Commit list for the ref already loaded. */
export const COMMIT_HISTORY_BRANCH = "branch";

/** Commit list for every local branch in the checkout. */
export const COMMIT_HISTORY_ALL = "all";

/** Which commits the history filter is showing. */
export type CommitHistoryScope =
  | typeof COMMIT_HISTORY_BRANCH
  | typeof COMMIT_HISTORY_ALL;

const DAY_SECONDS = 24 * 60 * 60;

/** Preset windows. A day is 24 hours. A year is 365 days. */
export const COMMIT_DATE_RANGES = [
  { label: "All time", seconds: null, value: ALL_COMMIT_DATES },
  { label: "Last 24 hours", seconds: DAY_SECONDS, value: "24h" },
  { label: "Last 7 days", seconds: 7 * DAY_SECONDS, value: "7d" },
  { label: "Last 30 days", seconds: 30 * DAY_SECONDS, value: "30d" },
  { label: "Last 90 days", seconds: 90 * DAY_SECONDS, value: "90d" },
  { label: "Last year", seconds: 365 * DAY_SECONDS, value: "365d" },
] as const;

export type CommitFeedFilters = {
  author: string;
  /** `all`, or one value from {@link COMMIT_DATE_RANGES}. */
  date: string;
  nowSeconds: number;
  query: string;
  repository: string;
};

type CommitFeedRow = {
  commit: ProjectRepoCommit;
  project: { name: string; repoAddress: string };
};

export type CommitAuthorOption = {
  key: string;
  label: string;
};

export type CommitRepositoryOption = {
  key: string;
  label: string;
};

/** Stable author key. Email wins. A name is the fallback. */
export function commitAuthorKey(commit: ProjectRepoCommit): string {
  const email = commit.authorEmail.trim().toLowerCase();
  if (email) return email;
  return commit.authorName.trim().toLowerCase();
}

/** Authors on this list, alphabetical. Same-name people stay separate. */
export function commitAuthorOptions(
  items: readonly CommitFeedRow[],
): CommitAuthorOption[] {
  const byKey = new Map<string, { email: string; name: string }>();
  for (const item of items) {
    const key = commitAuthorKey(item.commit);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, {
      email: item.commit.authorEmail.trim(),
      name: item.commit.authorName.trim(),
    });
  }
  const rows = [...byKey.entries()].map(([key, author]) => ({
    email: author.email,
    key,
    name: author.name || author.email,
  }));
  const nameCounts = new Map<string, number>();
  for (const row of rows) {
    nameCounts.set(row.name, (nameCounts.get(row.name) ?? 0) + 1);
  }
  return rows
    .map((row) => ({
      key: row.key,
      label:
        (nameCounts.get(row.name) ?? 0) > 1 && row.email
          ? `${row.name} (${row.email})`
          : row.name,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

/** Repositories on this list, alphabetical. */
export function commitRepositoryOptions(
  items: readonly CommitFeedRow[],
): CommitRepositoryOption[] {
  const byKey = new Map<string, string>();
  for (const item of items) {
    if (!byKey.has(item.project.repoAddress)) {
      byKey.set(item.project.repoAddress, item.project.name);
    }
  }
  return [...byKey.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function matchesQuery(commit: ProjectRepoCommit, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    commit.subject.toLowerCase().includes(needle) ||
    commit.authorName.toLowerCase().includes(needle) ||
    commit.authorEmail.toLowerCase().includes(needle) ||
    commit.hash.toLowerCase().includes(needle) ||
    commit.shortHash.toLowerCase().includes(needle)
  );
}

/** Unix seconds where a date preset starts. `null` keeps every commit. */
export function commitDateCutoff(
  preset: string,
  nowSeconds: number,
): number | null {
  const range = COMMIT_DATE_RANGES.find((item) => item.value === preset);
  if (!range || range.seconds === null) return null;
  return nowSeconds - range.seconds;
}

/** Keep commits that match the search, the author, the repository, and the date. */
export function filterCommitFeed<T extends CommitFeedRow>(
  items: readonly T[],
  filters: CommitFeedFilters,
): T[] {
  const cutoff = commitDateCutoff(filters.date, filters.nowSeconds);
  return items.filter((item) => {
    if (cutoff !== null && item.commit.timestamp < cutoff) return false;
    if (
      filters.author !== ALL_COMMIT_AUTHORS &&
      commitAuthorKey(item.commit) !== filters.author
    ) {
      return false;
    }
    if (
      filters.repository !== ALL_COMMIT_REPOSITORIES &&
      item.project.repoAddress !== filters.repository
    ) {
      return false;
    }
    return matchesQuery(item.commit, filters.query);
  });
}
