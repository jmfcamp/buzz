import { useQuery } from "@tanstack/react-query";
import { GitBranch, Link2 } from "lucide-react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { usePinnedSites } from "@/features/pinned-sites/hooks";

import {
  CODEBASE_ORIGIN_ARGV,
  codebaseOriginFromRemote,
  projectChannelPrimaryRepository,
  resolveCodebaseOrigin,
  storedRepositoryRemotes,
  type ChannelCodebaseRepository,
  type CodebaseOriginView,
} from "@/features/projects/lib/channelCodebase";
import { hulaDirectoryPath } from "@/features/projects/lib/hulaProjectNames";
import {
  findPortholePin,
  portholePathUrl,
} from "@/features/projects/lib/portholeLink";
import { hulaRootedDisplayPath } from "@/features/projects/lib/projectPathDisplay";
import type { Project } from "@/features/projects/hooks";
import { hulaGitExec } from "@/features/projects/useHulaRepositoryGit";
import { useCheckoutWorkContext } from "./checkoutWorkContext";
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

const BANNER_LINK_CLASS =
  "inline-flex shrink-0 items-center gap-1 text-foreground underline-offset-2 hover:underline";

function BannerSeparator() {
  return (
    <span aria-hidden="true" className="shrink-0 text-muted-foreground/40">
      ·
    </span>
  );
}

/** GitHub origins only. Other or unset origins show no link. */
function GitHubLink({ origin }: { origin: CodebaseOriginView | null }) {
  if (origin?.kind !== "github") return null;
  return (
    <>
      <BannerSeparator />
      <a
        className={BANNER_LINK_CLASS}
        data-testid="project-channel-github-link"
        href={origin.url}
        rel="noreferrer"
        target="_blank"
        title={`${origin.owner}/${origin.repo}`}
      >
        <Link2 aria-hidden="true" className="size-3 shrink-0" />
        GitHub
      </a>
    </>
  );
}

/**
 * Project banner: name, DRI, coding agent, then the Hula path, Porthole and
 * GitHub links, and the branch checked out on disk.
 * It sits above the section tabs and stays put when the section changes.
 * The path still opens the repository. Porthole opens the Porthole pinned
 * website at that path; with no Porthole pin the link is left out.
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
  const origin = !repository
    ? null
    : waiting
      ? null
      : originQuery.isSuccess && originQuery.data
        ? codebaseOriginFromRemote(originQuery.data)
        : resolveCodebaseOrigin(null, stored);

  const catalog = useCheckoutWorkContext()?.rail?.catalog ?? null;
  const workspacePath =
    root ??
    (project.hulaPath ? hulaDirectoryPath(project.hulaPath) : null) ??
    (catalog ? catalog.primaryDisplayPath || catalog.primaryPath : null);
  const pathLabel = workspacePath ? hulaRootedDisplayPath(workspacePath) : "";
  const branch = catalog?.currentName?.trim() || null;

  const { pins } = usePinnedSites();
  const { goPinnedSite } = useAppNavigation();
  const portholePin = findPortholePin(pins);
  const portholeUrl = portholePin
    ? portholePathUrl(
        portholePin.url,
        pathLabel.startsWith("Hula") ? pathLabel : null,
      )
    : null;

  return (
    <div
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
      data-testid="project-channel-primary-codebase"
    >
      <span className="min-w-0 truncate text-sm font-semibold leading-5 text-foreground">
        {project.name}
      </span>
      {repository ? <BannerSeparator /> : null}
      <ProjectChannelDriControl
        project={project}
        separator={Boolean(repository)}
      />
      {pathLabel ? (
        repository ? (
          <button
            className="min-w-0 truncate font-medium text-foreground underline-offset-2 hover:underline"
            data-testid={`project-home-context-repo-${repository.dtag}`}
            onClick={() => onOpenRepository(repository.id)}
            title={`${repository.name} · ${workspacePath ?? pathLabel}`}
            type="button"
          >
            {pathLabel}
          </button>
        ) : (
          <>
            <BannerSeparator />
            <span
              className="min-w-0 truncate font-medium text-foreground"
              title={workspacePath ?? pathLabel}
            >
              {pathLabel}
            </span>
          </>
        )
      ) : repository ? (
        <button
          className="min-w-0 truncate font-medium text-foreground underline-offset-2 hover:underline"
          data-testid={`project-home-context-repo-${repository.dtag}`}
          onClick={() => onOpenRepository(repository.id)}
          title={repository.name}
          type="button"
        >
          {repository.name}
        </button>
      ) : null}
      {portholePin && portholeUrl ? (
        <>
          <BannerSeparator />
          <button
            className={BANNER_LINK_CLASS}
            data-testid="project-channel-porthole-link"
            onClick={() =>
              void goPinnedSite(portholePin.id, undefined, {
                openUrl: portholeUrl,
              })
            }
            title={portholeUrl}
            type="button"
          >
            <Link2 aria-hidden="true" className="size-3 shrink-0" />
            Porthole
          </button>
        </>
      ) : null}
      <GitHubLink origin={origin} />
      {branch ? (
        <>
          <BannerSeparator />
          <span
            className="flex min-w-0 items-center gap-1"
            data-testid="project-channel-branch"
            title={branch}
          >
            <GitBranch aria-hidden="true" className="size-3 shrink-0" />
            <span className="min-w-0 truncate font-medium text-foreground">
              {branch}
            </span>
            <span className="shrink-0 text-muted-foreground/70">On disk</span>
          </span>
        </>
      ) : null}
    </div>
  );
}
