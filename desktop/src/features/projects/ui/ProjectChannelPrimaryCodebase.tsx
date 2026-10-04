import { useQuery } from "@tanstack/react-query";

import {
  CODEBASE_ORIGIN_ARGV,
  codebaseOriginFromRemote,
  loadedDefaultBranch,
  projectChannelPrimaryRepository,
  resolveCodebaseOrigin,
  storedRepositoryRemotes,
  type ChannelCodebaseRepository,
  type CodebaseOriginView,
} from "@/features/projects/lib/channelCodebase";
import { hulaDirectoryPath } from "@/features/projects/lib/hulaProjectNames";
import type { Project } from "@/features/projects/hooks";
import { hulaGitExec } from "@/features/projects/useHulaRepositoryGit";
import { ProjectChannelDriControl } from "./ProjectChannelDriControl";

/**
 * Read `git remote get-url origin` for one OpenClaw checkout.
 * A missing remote is null. A refused command throws so stored metadata can stand in.
 */
export async function readCheckoutOrigin(root: string): Promise<string | null> {
  const normalized = hulaDirectoryPath(root);
  if (!normalized) return null;
  const result = await hulaGitExec(CODEBASE_ORIGIN_ARGV, normalized);
  if (typeof result.exitCode === "number" && result.exitCode !== 0) return null;
  const remote = result.stdout.trim().split(/\r?\n/)[0]?.trim() ?? "";
  return remote || null;
}

function OriginFact({ origin }: { origin: CodebaseOriginView }) {
  if (origin.kind === "unset") {
    return <span>Origin is not set</span>;
  }
  if (origin.kind === "github") {
    return (
      <a
        className="min-w-0 truncate text-foreground underline-offset-2 hover:underline"
        href={origin.url}
        rel="noreferrer"
        target="_blank"
      >
        {origin.owner}/{origin.repo}
      </a>
    );
  }
  if (origin.kind === "link") {
    return (
      <a
        className="min-w-0 truncate text-foreground underline-offset-2 hover:underline"
        href={origin.url}
        rel="noreferrer"
        target="_blank"
      >
        {origin.label}
      </a>
    );
  }
  return <span className="min-w-0 truncate">{origin.label}</span>;
}

/**
 * Project identity bar: name, DRI, coding agent, codebase, and origin.
 * It sits above the section tabs and stays put when the section changes.
 * The codebase name still opens that repository. The origin is a real remote,
 * or "Origin is not set" when neither git nor the announcement has one.
 */
export function ProjectChannelPrimaryCodebase({
  onOpenRepository,
  project,
  repository: repositoryOverride,
}: {
  onOpenRepository: (repositoryId: string) => void;
  project: Project;
  /** Subrepository channel: show this repo instead of the primary. */
  repository?: ChannelCodebaseRepository | null;
}) {
  const repository =
    repositoryOverride ?? projectChannelPrimaryRepository(project);
  const root = repository?.hulaPath
    ? hulaDirectoryPath(repository.hulaPath)
    : null;
  const stored = storedRepositoryRemotes(repository);
  const originQuery = useQuery({
    enabled: Boolean(root),
    queryKey: ["project-channel-origin", root],
    queryFn: () => (root ? readCheckoutOrigin(root) : null),
    retry: 0,
    staleTime: 60_000,
  });
  const waiting = Boolean(root) && originQuery.isPending && stored.length === 0;
  const origin = waiting
    ? null
    : originQuery.isSuccess && originQuery.data
      ? codebaseOriginFromRemote(originQuery.data)
      : resolveCodebaseOrigin(null, stored);
  const defaultBranch = loadedDefaultBranch(repository);

  const projectName = (
    <span className="min-w-0 truncate text-sm font-semibold leading-5 text-foreground">
      {project.name}
    </span>
  );

  if (!repository) {
    return (
      <div
        className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
        data-testid="project-channel-primary-codebase"
      >
        {projectName}
        <ProjectChannelDriControl project={project} />
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
      data-testid="project-channel-primary-codebase"
    >
      {projectName}
      <span aria-hidden="true" className="shrink-0 text-muted-foreground/40">
        ·
      </span>
      <ProjectChannelDriControl project={project} separator />
      <span className="shrink-0">Codebase</span>
      <span aria-hidden="true" className="shrink-0 text-muted-foreground/40">
        ·
      </span>
      <button
        className="min-w-0 truncate font-medium text-foreground underline-offset-2 hover:underline"
        data-testid={`project-home-context-repo-${repository.dtag}`}
        onClick={() => onOpenRepository(repository.id)}
        title={repository.name}
        type="button"
      >
        {repository.name}
      </button>
      {origin ? (
        <>
          <span
            aria-hidden="true"
            className="shrink-0 text-muted-foreground/40"
          >
            ·
          </span>
          <OriginFact origin={origin} />
        </>
      ) : null}
      {defaultBranch ? (
        <>
          <span
            aria-hidden="true"
            className="shrink-0 text-muted-foreground/40"
          >
            ·
          </span>
          <span className="shrink-0 truncate">{defaultBranch}</span>
        </>
      ) : null}
    </div>
  );
}
