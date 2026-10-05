import {
  Check,
  ChevronDown,
  ClipboardCopy,
  Copy,
  FileCode2,
  Folder,
  GitBranch,
  GitCommitHorizontal,
} from "lucide-react";
import * as React from "react";

import { openUrl } from "@tauri-apps/plugin-opener";

import type {
  CheckoutFileStat,
  CheckoutFilesBrowseTarget,
  CheckoutFilesContext,
  CheckoutPullRequest,
  CheckoutRailCatalog,
  CheckoutRailSelection,
  CheckoutSelectionDetail,
  CheckoutWorkCardModel,
} from "@/features/projects/lib/checkoutWork";
import {
  checkoutAgentPrompt,
  checkoutFilesContext,
  checkoutRailLeadingOptions,
  checkoutRailSections,
  checkoutSelectionChips,
  isBranchMerged,
  isDefaultBranchSelection,
  pullRequestsForBase,
  pullRequestsForBranch,
  resolveCheckoutFilesBrowseTarget,
} from "@/features/projects/lib/checkoutWork";
import { hulaRootedDisplayPath } from "@/features/projects/lib/projectPathDisplay";
import { writeTextToClipboard } from "@/shared/lib/clipboard";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

const PREVIEW_COUNT = 6;

const RAIL_CARD_CLASS =
  "rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2";

/** Same row chrome as the old bottom Files / Tasks links. */
const RAIL_NAV_ROW_CLASS =
  "h-8 w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal text-sidebar-foreground/80 transition-[background-color,color] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50";

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function FileCounts({ file }: { file: CheckoutFileStat }) {
  if (file.additions == null && file.deletions == null) {
    const label = file.ignored
      ? "ignored"
      : file.untracked
        ? "untracked"
        : "binary";
    return <span className="shrink-0 text-muted-foreground">{label}</span>;
  }
  return (
    <span className="inline-flex shrink-0 gap-1.5 tabular-nums">
      <span className="text-green-500">+{file.additions ?? 0}</span>
      <span className="text-destructive">-{file.deletions ?? 0}</span>
    </span>
  );
}

/** Compact file list under an expanded commit or the selection Files row. */
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

function SelectionChip({ children }: { children: React.ReactNode }) {
  const label = typeof children === "string" ? children : "";
  const tone =
    label === "stale"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : label === "merged"
        ? "border-violet-500/40 bg-violet-500/15 text-violet-400"
        : label === "Current"
          ? "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400"
          : "border-border/70 bg-muted/40 text-muted-foreground";
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1.5 py-px text-2xs font-medium",
        tone,
      )}
    >
      {children}
    </span>
  );
}

function selectionIsMerged(
  selection: CheckoutRailSelection,
  pullRequests: readonly CheckoutPullRequest[],
): boolean {
  const branch = selection.branch?.trim();
  if (!branch) return false;
  return isBranchMerged(pullRequests, branch);
}

function selectionChips(
  selection: CheckoutRailSelection,
  catalog: Pick<
    CheckoutRailCatalog,
    "primaryPath" | "currentName" | "defaultBranch"
  >,
  pullRequests: readonly CheckoutPullRequest[],
): string[] {
  return checkoutSelectionChips(selection, catalog, {
    merged: selectionIsMerged(selection, pullRequests),
  });
}

/**
 * Top of the Files sheet: which branch or worktree the tree belongs to.
 * Same icon and chips as the rail selection.
 */
export function CheckoutFilesContextStrip({
  context,
}: {
  context: CheckoutFilesContext;
}) {
  const pathLabel = context.path ? hulaRootedDisplayPath(context.path) : null;
  const name = context.branch
    ? `${context.label} · ${context.branch}`
    : context.label;
  return (
    <div
      className="flex min-w-0 items-center gap-2 text-xs"
      data-kind={context.kind}
      data-testid="checkout-files-context"
    >
      {context.kind === "worktree" ? (
        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 truncate" title={name}>
        <span className="font-medium text-foreground">{context.label}</span>
        {context.branch ? (
          <span className="text-muted-foreground"> · {context.branch}</span>
        ) : null}
      </span>
      {context.chips.map((chip) => (
        <SelectionChip key={chip}>{chip}</SelectionChip>
      ))}
      <span
        className="min-w-0 flex-1 truncate text-right text-muted-foreground"
        data-testid="checkout-files-context-source"
        title={context.path ?? undefined}
      >
        {pathLabel ?? "Read from git, not on disk"}
      </span>
    </div>
  );
}

function CheckoutSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-2 py-1.5 text-xs font-normal text-muted-foreground"
      role="presentation"
    >
      {children}
    </div>
  );
}

function SelectionRowIcon({ kind }: { kind: CheckoutRailSelection["kind"] }) {
  if (kind === "branch") {
    return <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  return <Folder className="size-3.5 shrink-0 text-muted-foreground" />;
}

function SelectionRowLabel({ option }: { option: CheckoutRailSelection }) {
  const showBranch =
    (option.kind === "worktree" || option.kind === "checkout") && option.branch;
  return (
    <span className="min-w-0 flex-1 truncate">
      <span className="text-foreground">{option.label}</span>
      {showBranch ? (
        <span className="text-muted-foreground"> · {option.branch}</span>
      ) : null}
    </span>
  );
}

function CheckoutSelectionDropdown({
  catalog,
  onSelect,
  pullRequests,
  selectedId,
}: {
  catalog: CheckoutRailCatalog;
  onSelect: (id: string) => void;
  pullRequests: readonly CheckoutPullRequest[];
  selectedId: string | null;
}) {
  const leadingOptions = checkoutRailLeadingOptions(
    catalog.selections,
    catalog.defaultBranch,
  );
  const sections = checkoutRailSections(
    catalog.selections,
    catalog.defaultBranch,
  );
  const selected =
    catalog.selections.find((entry) => entry.id === selectedId) ??
    catalog.selections[0];
  if (!selected || (leadingOptions.length === 0 && sections.length === 0)) {
    return null;
  }
  const triggerLabel =
    (selected.kind === "worktree" || selected.kind === "checkout") &&
    selected.branch
      ? `${selected.label} · ${selected.branch}`
      : selected.label;

  const renderOption = (option: CheckoutRailSelection) => {
    const active = option.id === selected.id;
    const chips = selectionChips(option, catalog, pullRequests);
    return (
      <DropdownMenuItem
        className="justify-between gap-2"
        data-testid={`checkout-selection-${option.id}`}
        key={option.id}
        onSelect={() => onSelect(option.id)}
      >
        <SelectionRowIcon kind={option.kind} />
        <SelectionRowLabel option={option} />
        <span className="inline-flex shrink-0 items-center gap-1">
          {chips.map((chip) => (
            <SelectionChip key={chip}>{chip}</SelectionChip>
          ))}
          {active ? <Check className="size-3.5 shrink-0" /> : null}
        </span>
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="h-8 w-full justify-start gap-1.5 px-1.5 text-left text-xs font-medium"
          data-testid="checkout-worktree-dropdown"
          type="button"
          variant="ghost"
        >
          <span className="min-w-0 flex-1 truncate">{triggerLabel}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56 max-w-80">
        {leadingOptions.map((option) => renderOption(option))}
        {sections.map((section, index) => (
          <React.Fragment key={section.id}>
            {leadingOptions.length > 0 || index > 0 ? (
              <DropdownMenuSeparator />
            ) : null}
            <CheckoutSectionHeader>{section.label}</CheckoutSectionHeader>
            {section.options.map((option) => renderOption(option))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Ghost icon button that copies text and flashes a check for ~1.5s. */
function CopyIconButton({
  icon,
  label,
  testId,
  text,
}: {
  icon: React.ReactNode;
  label: string;
  testId: string;
  text: string;
}) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      aria-label={label}
      className="shrink-0 text-muted-foreground hover:text-foreground"
      data-testid={testId}
      onClick={() => {
        void writeTextToClipboard(text)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
      size="icon-xs"
      title={label}
      type="button"
      variant="ghost"
    >
      {copied ? <Check className="size-3.5" /> : icon}
    </Button>
  );
}

/** Tree path the Files link opens for checkout/worktree selections. */
function selectionTreePath(
  selection: CheckoutRailSelection,
  catalog: CheckoutRailCatalog,
): string | null {
  if (selection.kind !== "checkout" && selection.kind !== "worktree") {
    return null;
  }
  return resolveCheckoutFilesBrowseTarget(selection, catalog)?.root ?? null;
}

function selectionAgentPrompt(
  selection: CheckoutRailSelection,
  catalog: CheckoutRailCatalog,
): string {
  const treePath = selectionTreePath(selection, catalog);
  return checkoutAgentPrompt({
    kind: isDefaultBranchSelection(selection, catalog)
      ? "main"
      : selection.kind,
    branch: selection.branch,
    path: treePath ? hulaRootedDisplayPath(treePath, 8) : null,
    primaryPath: hulaRootedDisplayPath(catalog.primaryPath, 8),
    hulaPath: hulaRootedDisplayPath(
      catalog.primaryDisplayPath || catalog.primaryPath,
      8,
    ),
    defaultBranch: catalog.defaultBranch,
  });
}

function CheckoutSelectionBody({
  catalog,
  detail,
  onOpenCommit,
  onOpenFiles,
  onViewAllCommits,
  pullRequests,
  selection,
}: {
  catalog: CheckoutRailCatalog;
  detail: CheckoutSelectionDetail;
  onOpenCommit?: (hash: string) => void;
  onOpenFiles?: (target: CheckoutFilesBrowseTarget) => void;
  onViewAllCommits?: () => void;
  pullRequests: readonly CheckoutPullRequest[];
  selection: CheckoutRailSelection;
}) {
  const onDefaultBranch = isDefaultBranchSelection(selection, catalog);
  const merged = selectionIsMerged(selection, pullRequests);
  const branchPrs = selection.branch
    ? onDefaultBranch
      ? pullRequestsForBase(pullRequests, selection.branch)
      : pullRequestsForBranch(pullRequests, selection.branch)
    : [];
  const [commitsExpanded, setCommitsExpanded] = React.useState(false);
  const [openHash, setOpenHash] = React.useState<string | null>(null);
  const commits = detail.commits;
  const visibleCommits = commitsExpanded ? commits : commits.slice(0, 4);
  const hiddenCommits = commits.length - visibleCommits.length;
  const filesTarget = resolveCheckoutFilesBrowseTarget(selection, catalog);
  const canOpenFiles = Boolean(onOpenFiles && filesTarget);
  const diffAdditions = detail.work?.additions;
  const diffDeletions = detail.work?.deletions;
  const showDiff =
    !detail.noWorkingTree &&
    detail.work != null &&
    (diffAdditions != null || diffDeletions != null);
  return (
    <>
      <div data-testid="checkout-selection-files">
        <Button
          className={RAIL_NAV_ROW_CLASS}
          data-testid="checkout-selection-files-link"
          disabled={!canOpenFiles}
          onClick={() => {
            if (!onOpenFiles || !filesTarget) return;
            onOpenFiles({
              ...filesTarget,
              context: checkoutFilesContext(selection, catalog, { merged }),
            });
          }}
          size="sm"
          title={
            filesTarget
              ? `Browse files at ${filesTarget.gitRef} in ${filesTarget.root}`
              : undefined
          }
          type="button"
          variant="ghost"
        >
          <span className="flex size-4 shrink-0 items-center justify-center text-current">
            <FileCode2 className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-left">Files</span>
          {showDiff ? (
            <span className="inline-flex shrink-0 gap-1.5 text-xs tabular-nums">
              <span className="text-green-500">+{diffAdditions ?? 0}</span>
              <span className="text-destructive">-{diffDeletions ?? 0}</span>
            </span>
          ) : null}
        </Button>
        {detail.noWorkingTree ? (
          <p
            className="px-2 text-xs text-muted-foreground"
            data-testid="checkout-no-working-tree"
          >
            No working tree for this branch.
          </p>
        ) : detail.work && detail.work.files.length > 0 ? (
          <div className="mt-1">
            <CheckoutFileStatList
              files={detail.work.files}
              testId="checkout-selection-file-list"
            />
          </div>
        ) : null}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <SectionLabel>
            {onDefaultBranch
              ? `Commits on ${catalog.defaultBranch}`
              : "Commits"}
          </SectionLabel>
          {onDefaultBranch && onViewAllCommits ? (
            <button
              className="px-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              data-testid="checkout-commits-view-all"
              onClick={onViewAllCommits}
              type="button"
            >
              View all
            </button>
          ) : null}
        </div>
        {commits.length === 0 ? (
          <p className="px-2 text-xs text-muted-foreground">
            {onDefaultBranch
              ? `No commits on ${catalog.defaultBranch}.`
              : "No commits ahead of the default branch."}
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
                    {commit.additions > 0 || commit.deletions > 0 ? (
                      <span className="inline-flex shrink-0 gap-1.5 tabular-nums">
                        <span className="text-green-500">
                          +{commit.additions}
                        </span>
                        <span className="text-destructive">
                          -{commit.deletions}
                        </span>
                      </span>
                    ) : null}
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
      {branchPrs.length > 0 ? (
        <div className="space-y-1" data-testid="checkout-selection-prs">
          <SectionLabel>Pull requests</SectionLabel>
          <ul className="space-y-1">
            {branchPrs.map((pr) => (
              <li key={pr.number}>
                <button
                  className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-sidebar-accent"
                  data-testid={`checkout-work-pr-${pr.number}`}
                  onClick={() => void openUrl(pr.url)}
                  title={pr.title}
                  type="button"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">#{pr.number}</span> {pr.title}
                  </span>
                  <SelectionChip>{pr.state}</SelectionChip>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

export function CheckoutWorkRail({
  catalog,
  detail,
  error,
  isLoading,
  missingCheckout,
  onOpenCommit,
  onOpenFiles,
  onSelect,
  onViewAllCommits,
  pullRequests = [],
  selectedId,
  selection,
}: {
  catalog: CheckoutRailCatalog | null;
  detail: CheckoutSelectionDetail | null;
  error: string | null;
  isLoading: boolean;
  missingCheckout: boolean;
  onOpenCommit?: (hash: string) => void;
  onOpenFiles?: (target: CheckoutFilesBrowseTarget) => void;
  onSelect?: (id: string) => void;
  onViewAllCommits?: () => void;
  pullRequests?: readonly CheckoutPullRequest[];
  selectedId?: string | null;
  selection?: CheckoutRailSelection | null;
}) {
  if (!isLoading && !error && !missingCheckout && !catalog && !detail) {
    return null;
  }
  const selectedTreePath =
    selection && catalog ? selectionTreePath(selection, catalog) : null;
  return (
    <section
      className="shrink-0 space-y-3 border-b border-sidebar-border/70 pb-3"
      data-testid="checkout-work-rail"
    >
      {catalog && onSelect ? (
        <div className={RAIL_CARD_CLASS} data-testid="checkout-selection-card">
          <CheckoutSelectionDropdown
            catalog={catalog}
            onSelect={onSelect}
            pullRequests={pullRequests}
            selectedId={selectedId ?? null}
          />
        </div>
      ) : null}
      {selection && catalog ? (
        <div className={RAIL_CARD_CLASS} data-testid="checkout-detail-card">
          <div
            className="flex min-w-0 flex-wrap items-center gap-2"
            data-testid="checkout-selection-header"
          >
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
              {selection.label}
            </span>
            {selectionChips(selection, catalog, pullRequests).map((chip) => (
              <SelectionChip key={chip}>{chip}</SelectionChip>
            ))}
            <span className="inline-flex shrink-0 items-center">
              {selectedTreePath ? (
                <CopyIconButton
                  icon={<Copy className="size-3.5" />}
                  key={`path:${selection.id}`}
                  label="Copy path"
                  testId="checkout-copy-path"
                  text={selectedTreePath}
                />
              ) : null}
              <CopyIconButton
                icon={<ClipboardCopy className="size-3.5" />}
                key={`prompt:${selection.id}`}
                label="Copy agent prompt"
                testId="checkout-copy-agent-prompt"
                text={selectionAgentPrompt(selection, catalog)}
              />
            </span>
          </div>
          {isLoading && !detail ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Reading the checkout…
            </p>
          ) : null}
          {error ? (
            <p
              className="mt-2 text-xs text-destructive"
              data-testid="checkout-work-error"
            >
              {error}
            </p>
          ) : null}
          {detail ? (
            <div className="mt-2 space-y-3">
              <CheckoutSelectionBody
                catalog={catalog}
                detail={detail}
                key={selectedId ?? selection?.id ?? "detail"}
                onOpenCommit={onOpenCommit}
                onOpenFiles={onOpenFiles}
                onViewAllCommits={onViewAllCommits}
                pullRequests={pullRequests}
                selection={selection}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {isLoading && !detail ? (
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
        </>
      )}
      {missingCheckout ? (
        <p className="px-2 text-xs text-muted-foreground">
          No local checkout is recorded for this repository.
        </p>
      ) : null}
    </section>
  );
}
