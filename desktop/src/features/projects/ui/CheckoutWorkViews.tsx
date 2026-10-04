import { GitCommitHorizontal } from "lucide-react";
import * as React from "react";

import type {
  CheckoutFileStat,
  CheckoutWork,
  CheckoutWorkCardModel,
} from "@/features/projects/lib/checkoutWork";
import { cn } from "@/shared/lib/cn";

const PREVIEW_COUNT = 6;

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function FileCounts({ file }: { file: CheckoutFileStat }) {
  if (file.additions == null && file.deletions == null) {
    return (
      <span className="shrink-0 text-muted-foreground">
        {file.untracked ? "untracked" : "binary"}
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 gap-1.5 tabular-nums">
      <span className="text-green-500">+{file.additions ?? 0}</span>
      <span className="text-destructive">-{file.deletions ?? 0}</span>
    </span>
  );
}

export function CheckoutFileStatList({
  files,
  testId,
}: {
  files: readonly CheckoutFileStat[];
  testId: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? files : files.slice(0, PREVIEW_COUNT);
  const hidden = files.length - visible.length;
  if (files.length === 0) {
    return (
      <p className="px-2 text-xs text-muted-foreground">No file changes.</p>
    );
  }
  return (
    <div data-testid={testId}>
      <ul className="space-y-0.5">
        {visible.map((file) => (
          <li
            className="flex min-w-0 items-center gap-2 px-2 text-xs"
            key={file.path}
            title={file.path}
          >
            <span className="min-w-0 flex-1 truncate">{file.path}</span>
            <FileCounts file={file} />
          </li>
        ))}
      </ul>
      {files.length > PREVIEW_COUNT ? (
        <button
          className="mt-1 px-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          data-testid={`${testId}-more`}
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? "Show less" : `Show ${hidden} more`}
        </button>
      ) : null}
    </div>
  );
}

function OpenCommitButton({
  hash,
  label,
  onOpenCommit,
}: {
  hash: string;
  label: string;
  onOpenCommit?: (hash: string) => void;
}) {
  if (!onOpenCommit) return null;
  return (
    <button
      className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      data-testid="checkout-work-open-commit"
      onClick={() => onOpenCommit(hash)}
      type="button"
    >
      {label}
    </button>
  );
}

/** Codex-style summary under the agent's finished reply. */
export function CheckoutWorkCard({
  card,
  onOpenCommit,
}: {
  card: CheckoutWorkCardModel;
  onOpenCommit?: (hash: string) => void;
}) {
  return (
    <div
      className="mt-1 max-w-xl rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2"
      data-testid="checkout-work-card"
    >
      <div className="flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          Edited {countLabel(card.fileCount, "file")}
        </p>
        <span className="inline-flex shrink-0 gap-1.5 text-xs tabular-nums">
          <span className="text-green-500">+{card.additions}</span>
          <span className="text-destructive">-{card.deletions}</span>
        </span>
      </div>
      <div className="mt-1.5">
        <CheckoutFileStatList
          files={card.files}
          testId="checkout-work-card-files"
        />
      </div>
      {card.commit ? (
        <div className="mt-1.5 flex min-w-0 items-center gap-2 px-2">
          <GitCommitHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {card.commit.subject || card.commit.shortHash}
          </span>
          <OpenCommitButton
            hash={card.commit.hash}
            label={`Open ${card.commit.shortHash}`}
            onOpenCommit={onOpenCommit}
          />
        </div>
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-2 text-xs font-medium text-sidebar-foreground/70">
      {children}
    </h3>
  );
}

export function CheckoutWorkRail({
  error,
  isLoading,
  missingCheckout,
  onOpenCommit,
  work,
}: {
  error: string | null;
  isLoading: boolean;
  missingCheckout: boolean;
  onOpenCommit?: (hash: string) => void;
  work: CheckoutWork | null;
}) {
  const [commitsExpanded, setCommitsExpanded] = React.useState(false);
  const [openHash, setOpenHash] = React.useState<string | null>(null);
  if (!isLoading && !error && !missingCheckout && !work) return null;
  const commits = work?.commits ?? [];
  const visibleCommits = commitsExpanded ? commits : commits.slice(0, 4);
  const hiddenCommits = commits.length - visibleCommits.length;
  return (
    <section
      className="-mx-2 space-y-3 border-b border-sidebar-border/70 px-2 pb-3"
      data-testid="checkout-work-rail"
    >
      <div className="flex min-w-0 items-center gap-2 px-2">
        <h2 className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground/70">
          Checkout
        </h2>
        {work?.branch ? (
          <span
            className="max-w-32 truncate text-xs text-sidebar-foreground/60"
            title={work.branch}
          >
            {work.branch}
          </span>
        ) : null}
      </div>
      {isLoading && !work ? (
        <p className="px-2 text-xs text-muted-foreground">
          Reading the checkout…
        </p>
      ) : null}
      {error ? (
        <p
          className="px-2 text-xs text-destructive"
          data-testid="checkout-work-error"
        >
          {error}
        </p>
      ) : null}
      {missingCheckout ? (
        <p className="px-2 text-xs text-muted-foreground">
          No local checkout is recorded for this repository.
        </p>
      ) : null}
      {work ? (
        <>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <SectionLabel>Working tree</SectionLabel>
              <span className="ml-auto inline-flex gap-1.5 pr-2 text-xs tabular-nums">
                <span className="text-green-500">+{work.additions}</span>
                <span className="text-destructive">-{work.deletions}</span>
              </span>
            </div>
            {work.files.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">
                No uncommitted changes.
              </p>
            ) : (
              <CheckoutFileStatList
                files={work.files}
                testId="checkout-work-tree-files"
              />
            )}
          </div>
          <div className="space-y-1">
            <SectionLabel>Commits</SectionLabel>
            {commits.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">
                No commits on this checkout.
              </p>
            ) : (
              <ul className="space-y-1">
                {visibleCommits.map((commit) => {
                  const open = openHash === commit.hash;
                  return (
                    <li key={commit.hash}>
                      <button
                        className={cn(
                          "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-sidebar-accent",
                          open && "bg-sidebar-accent",
                        )}
                        data-testid={`checkout-work-commit-${commit.shortHash}`}
                        onClick={() =>
                          setOpenHash((current) =>
                            current === commit.hash ? null : commit.hash,
                          )
                        }
                        title={commit.subject}
                        type="button"
                      >
                        <GitCommitHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">
                          {commit.subject || commit.shortHash}
                        </span>
                        <span className="inline-flex shrink-0 gap-1.5 tabular-nums">
                          <span className="text-green-500">
                            +{commit.additions}
                          </span>
                          <span className="text-destructive">
                            -{commit.deletions}
                          </span>
                        </span>
                      </button>
                      {open ? (
                        <div className="pb-1 pt-0.5">
                          <CheckoutFileStatList
                            files={commit.files}
                            testId={`checkout-work-commit-files-${commit.shortHash}`}
                          />
                          <div className="px-2 pt-1">
                            <OpenCommitButton
                              hash={commit.hash}
                              label={`Open ${commit.shortHash}`}
                              onOpenCommit={onOpenCommit}
                            />
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {commits.length > 4 ? (
              <button
                className="px-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                onClick={() => setCommitsExpanded((current) => !current)}
                type="button"
              >
                {commitsExpanded ? "Show less" : `Show ${hiddenCommits} more`}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
