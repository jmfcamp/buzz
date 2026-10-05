import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import {
  hulaBlobText,
  hulaFilesErrorMessage,
  hulaFilesUseWorktreeDisk,
  hulaOpenFilePath,
  hulaShowFileArgv,
  loadHulaFilesSnapshot,
} from "@/features/projects/lib/hulaFiles";
import type { ProjectRepoSnapshot } from "@/shared/api/projectGitTypes";
import {
  callOpenClawWorkspaceTool,
  openClawWorkspaceClient,
} from "@/features/projects/lib/openClawWorkspaceClient";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import { ProjectPanelState } from "./ProjectPanelState";
import { RepositoryFilesPanel } from "./ProjectRepositoryPanel";

/**
 * OpenClaw files in the same table the repository Files tab uses.
 * At HEAD, rows are the worktree on disk (with git status). Other refs use the
 * tracked tree. Opening a file reads disk at HEAD, otherwise the blob.
 * It does not change the checkout.
 */
export function HulaProjectFiles({
  fallbackAuthorPubkey,
  gitRef = "HEAD",
  initialPath,
  onContextChange,
  onOpenCommit,
  onSnapshot,
  profiles,
  rootPath,
}: {
  fallbackAuthorPubkey?: string;
  /** Git ref to read. `HEAD` is the OpenClaw checkout. */
  gitRef?: string;
  initialPath?: string;
  onContextChange?: (context: {
    kind: "file" | "folder";
    onBack?: () => void;
    path: string;
  }) => void;
  onOpenCommit?: (commitHash: string) => void;
  onSnapshot?: (snapshot: ProjectRepoSnapshot | null) => void;
  profiles?: UserProfileLookup;
  rootPath: string;
}) {
  const snapshotQuery = useQuery({
    queryKey: ["hula-files", rootPath, gitRef],
    queryFn: () =>
      loadHulaFilesSnapshot(
        rootPath,
        (argv, cwd) => openClawWorkspaceClient.exec([...argv], cwd),
        { list: callOpenClawWorkspaceTool, ref: gitRef },
      ),
  });
  const useDisk = hulaFilesUseWorktreeDisk(gitRef, callOpenClawWorkspaceTool);
  const fileContentSource = React.useMemo(
    () => ({
      cacheKey: ["hula-openclaw-file", rootPath, gitRef] as const,
      load: async (path: string) => {
        if (useDisk) {
          const full = hulaOpenFilePath(rootPath, path);
          if (!full) return null;
          const text = await openClawWorkspaceClient.readFile(full);
          return text == null ? null : hulaBlobText(text);
        }
        const argv = hulaShowFileArgv(gitRef, path);
        if (!argv) return null;
        const result = await openClawWorkspaceClient.exec(argv, rootPath);
        if (typeof result.exitCode === "number" && result.exitCode !== 0) {
          return null;
        }
        return hulaBlobText(result.stdout);
      },
    }),
    [gitRef, rootPath, useDisk],
  );
  const snapshot = snapshotQuery.data ?? null;

  React.useEffect(() => {
    onSnapshot?.(snapshotQuery.isPending ? null : snapshot);
  }, [onSnapshot, snapshot, snapshotQuery.isPending]);

  if (snapshotQuery.isError) {
    return (
      <ProjectPanelState
        description={hulaFilesErrorMessage(snapshotQuery.error)}
        error
        title="Could not load files"
      />
    );
  }

  return (
    <RepositoryFilesPanel
      error={null}
      fallbackAuthorPubkey={fallbackAuthorPubkey}
      fileContentSource={fileContentSource}
      files={snapshot?.files ?? []}
      initialPath={initialPath}
      isLoading={snapshotQuery.isPending}
      onContextChange={onContextChange}
      onOpenCommit={onOpenCommit}
      profiles={profiles}
      snapshot={snapshot}
    />
  );
}
