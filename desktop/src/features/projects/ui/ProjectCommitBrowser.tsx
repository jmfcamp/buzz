import {
  ALL_COMMIT_AUTHORS,
  ALL_COMMIT_DATES,
  ALL_COMMIT_REPOSITORIES,
  COMMIT_DATE_RANGES,
  COMMIT_HISTORY_ALL,
  COMMIT_HISTORY_BRANCH,
  commitAuthorOptions,
  commitRepositoryOptions,
  filterCommitFeed,
  type CommitFeedFilters,
  type CommitHistoryScope,
} from "@/features/projects/lib/projectCommitFilters";
import type { ProjectRepoCommit } from "@/shared/api/projectGitTypes";
import * as React from "react";

import { PROJECT_DETAIL_PANEL_CLASS } from "./projectPanelStyles";
import { ProjectPanelState } from "./ProjectPanelState";

type CommitBrowserItem = {
  commit: ProjectRepoCommit;
  project: { name: string; repoAddress: string };
};

function pluralCommits(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "commit" : "commits"}`;
}

function CommitFilterBar({
  author,
  authorOptions,
  date,
  historyScope,
  onAuthorChange,
  onDateChange,
  onHistoryScopeChange,
  onQueryChange,
  onRepositoryChange,
  query,
  repository,
  repositoryOptions,
}: {
  author: string;
  authorOptions: ReturnType<typeof commitAuthorOptions>;
  date: string;
  historyScope?: CommitHistoryScope;
  onAuthorChange: (author: string) => void;
  onDateChange: (date: string) => void;
  onHistoryScopeChange?: (scope: CommitHistoryScope) => void;
  onQueryChange: (query: string) => void;
  onRepositoryChange: (repository: string) => void;
  query: string;
  repository: string;
  repositoryOptions: ReturnType<typeof commitRepositoryOptions>;
}) {
  const filtered =
    query.trim().length > 0 ||
    author !== ALL_COMMIT_AUTHORS ||
    date !== ALL_COMMIT_DATES ||
    repository !== ALL_COMMIT_REPOSITORIES;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
      <label className="sr-only" htmlFor="project-commit-search">
        Search commits
      </label>
      <input
        autoComplete="off"
        className="h-8 min-w-40 flex-1 rounded-md border border-input bg-background px-2 text-sm"
        data-testid="project-commit-search"
        id="project-commit-search"
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search subject, author, or hash"
        spellCheck={false}
        type="text"
        value={query}
      />
      {authorOptions.length > 1 ? (
        <>
          <label className="sr-only" htmlFor="project-commit-author-filter">
            Author
          </label>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            data-testid="project-commit-author-filter"
            id="project-commit-author-filter"
            onChange={(event) => onAuthorChange(event.target.value)}
            value={author}
          >
            <option value={ALL_COMMIT_AUTHORS}>All authors</option>
            {authorOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {onHistoryScopeChange ? (
        <>
          <label className="sr-only" htmlFor="project-commit-history-filter">
            Commit history
          </label>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            data-testid="project-commit-history-filter"
            id="project-commit-history-filter"
            onChange={(event) =>
              onHistoryScopeChange(
                event.target.value === COMMIT_HISTORY_ALL
                  ? COMMIT_HISTORY_ALL
                  : COMMIT_HISTORY_BRANCH,
              )
            }
            title="This branch, or every commit on every local branch"
            value={historyScope ?? COMMIT_HISTORY_BRANCH}
          >
            <option value={COMMIT_HISTORY_BRANCH}>This branch</option>
            <option value={COMMIT_HISTORY_ALL}>All commits</option>
          </select>
        </>
      ) : null}
      <label className="sr-only" htmlFor="project-commit-date-filter">
        Date
      </label>
      <select
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        data-testid="project-commit-date-filter"
        id="project-commit-date-filter"
        onChange={(event) => onDateChange(event.target.value)}
        value={date}
      >
        {COMMIT_DATE_RANGES.map((range) => (
          <option key={range.value} value={range.value}>
            {range.label}
          </option>
        ))}
      </select>
      {repositoryOptions.length > 1 ? (
        <>
          <label className="sr-only" htmlFor="project-commit-repo-filter">
            Repository
          </label>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            data-testid="project-commit-repo-filter"
            id="project-commit-repo-filter"
            onChange={(event) => onRepositoryChange(event.target.value)}
            value={repository}
          >
            <option value={ALL_COMMIT_REPOSITORIES}>All repositories</option>
            {repositoryOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {filtered ? (
        <button
          className="h-8 shrink-0 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          data-testid="project-commit-clear-filters"
          onClick={() => {
            onQueryChange("");
            onAuthorChange(ALL_COMMIT_AUTHORS);
            onDateChange(ALL_COMMIT_DATES);
            onRepositoryChange(ALL_COMMIT_REPOSITORIES);
          }}
          type="button"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

/**
 * Search, author, date, repository, and history filters for a commit list.
 * Narrowing filters choose which supplied rows render.
 * All commits asks the parent for every local branch.
 */
export function ProjectCommitBrowser<T extends CommitBrowserItem>({
  historyError = false,
  historyLoading = false,
  historyScope,
  historyTruncated = false,
  items,
  nowSeconds = Math.floor(Date.now() / 1000),
  onHistoryScopeChange,
  renderItems,
}: {
  /** True when an all-commits read failed. Loaded commits still render. */
  historyError?: boolean;
  /** True while the all-commits read is in flight. */
  historyLoading?: boolean;
  historyScope?: CommitHistoryScope;
  historyTruncated?: boolean;
  items: readonly T[];
  /** Unix seconds used by the date presets. Defaults to the current time. */
  nowSeconds?: number;
  /** Present only when the list can read every local branch. */
  onHistoryScopeChange?: (scope: CommitHistoryScope) => void;
  renderItems: (items: readonly T[]) => React.ReactNode;
}) {
  const [query, setQuery] = React.useState("");
  const [author, setAuthor] = React.useState(ALL_COMMIT_AUTHORS);
  const [date, setDate] = React.useState(ALL_COMMIT_DATES);
  const [repository, setRepository] = React.useState(ALL_COMMIT_REPOSITORIES);
  const authorOptions = React.useMemo(
    () => commitAuthorOptions(items),
    [items],
  );
  const repositoryOptions = React.useMemo(
    () => commitRepositoryOptions(items),
    [items],
  );
  React.useEffect(() => {
    if (
      author !== ALL_COMMIT_AUTHORS &&
      !authorOptions.some((option) => option.key === author)
    ) {
      setAuthor(ALL_COMMIT_AUTHORS);
    }
  }, [author, authorOptions]);
  React.useEffect(() => {
    if (
      repository !== ALL_COMMIT_REPOSITORIES &&
      !repositoryOptions.some((option) => option.key === repository)
    ) {
      setRepository(ALL_COMMIT_REPOSITORIES);
    }
  }, [repository, repositoryOptions]);
  const showingAll = historyScope === COMMIT_HISTORY_ALL;
  const waitingForAll = showingAll && historyLoading;
  const allFailed = showingAll && historyError;
  const filters = React.useMemo<CommitFeedFilters>(
    () => ({ author, date, nowSeconds, query, repository }),
    [author, date, nowSeconds, query, repository],
  );
  const filtered = React.useMemo(
    () => filterCommitFeed(items, filters),
    [filters, items],
  );
  const countLabel =
    filtered.length === items.length
      ? pluralCommits(items.length)
      : `${filtered.length.toLocaleString()} of ${pluralCommits(items.length)}`;

  return (
    <section className={PROJECT_DETAIL_PANEL_CLASS} data-project-detail-panel>
      <CommitFilterBar
        author={author}
        authorOptions={authorOptions}
        date={date}
        historyScope={historyScope}
        onAuthorChange={setAuthor}
        onDateChange={setDate}
        onHistoryScopeChange={onHistoryScopeChange}
        onQueryChange={setQuery}
        onRepositoryChange={setRepository}
        query={query}
        repository={repository}
        repositoryOptions={repositoryOptions}
      />
      {waitingForAll ? (
        <p
          className="px-4 py-6 text-sm text-muted-foreground"
          data-testid="project-commit-history-loading"
          role="status"
        >
          Reading every commit.
        </p>
      ) : (
        <>
          <p
            aria-live="polite"
            className="px-4 py-2 text-xs text-muted-foreground"
            data-testid="project-commit-count"
          >
            {countLabel}
          </p>
          {historyTruncated ? (
            <p
              className="px-4 pb-2 text-xs text-muted-foreground"
              data-testid="project-commit-history-truncated"
              role="status"
            >
              This is the newest history that fit in one read. Older commits are
              not in this list.
            </p>
          ) : null}
          {allFailed && filtered.length === 0 ? (
            <ProjectPanelState
              description="Choose This branch to see the commits already loaded."
              error
              panel={false}
              testId="project-commit-history-error"
              title="Could not read every commit."
            />
          ) : filtered.length === 0 ? (
            <ProjectPanelState
              description="Clear the filters to see every commit."
              panel={false}
              testId="project-commit-filter-empty"
              title="No matching commits"
            />
          ) : (
            <>
              {allFailed ? (
                <p
                  className="px-4 pb-2 text-xs text-muted-foreground"
                  data-testid="project-commit-history-error"
                  role="status"
                >
                  Some repositories did not load. The commits that loaded are
                  listed.
                </p>
              ) : null}
              {renderItems(filtered)}
            </>
          )}
        </>
      )}
    </section>
  );
}
