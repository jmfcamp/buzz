import * as React from "react";
import {
  Archive,
  ArchiveRestore,
  CopyPlus,
  Download,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import type { IdentityArchiveActions } from "@/features/identity-archive/hooks";
import { useDirectControlsOff } from "@/features/bridge/ui/DesktopData";
import { ArchiveConfirmDialog } from "@/features/profile/ui/ArchiveConfirmDialog";
import type { ManagedAgent } from "@/shared/api/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button, buttonVariants } from "@/shared/ui/button";
import { PanelSectionGroup } from "@/shared/ui/PanelSectionGroup";

export function UserProfileAgentManagementRows({
  archiveActions,
  canArchiveAgent,
  canDeleteAgent,
  isDeletePending,
  managedAgent,
  supplementalAction,
  onCreateCard,
  onDeleteAgent,
  onDuplicateAgent,
  onExportAgent,
}: {
  archiveActions: IdentityArchiveActions;
  canArchiveAgent: boolean;
  canDeleteAgent: boolean;
  isDeletePending: boolean;
  managedAgent?: ManagedAgent;
  supplementalAction?: React.ReactNode;
  /** Mint an agent trading card. Present only for owner-managed personas. */
  onCreateCard?: () => void;
  onDeleteAgent: () => void;
  onDuplicateAgent?: () => void;
  onExportAgent?: () => void;
}) {
  const { off: directOff, hint: directHint } = useDirectControlsOff();
  const rowDisabled = isDeletePending || directOff;
  if (
    !onCreateCard &&
    !onDuplicateAgent &&
    !onExportAgent &&
    !supplementalAction &&
    !canArchiveAgent &&
    !canDeleteAgent
  ) {
    return null;
  }

  return (
    <PanelSectionGroup testId="user-profile-agent-management-section">
      {onDuplicateAgent ? (
        <ProfileAgentActionRow
          disabled={rowDisabled}
          icon={CopyPlus}
          label="Duplicate agent"
          onClick={onDuplicateAgent}
          testId="user-profile-duplicate-agent-row"
          title={directOff ? directHint : undefined}
        />
      ) : null}
      {onExportAgent ? (
        <ProfileAgentActionRow
          disabled={rowDisabled}
          icon={Download}
          label="Export agent"
          onClick={onExportAgent}
          testId="user-profile-export-agent-row"
          title={directOff ? directHint : undefined}
        />
      ) : null}
      {onCreateCard ? (
        <ProfileAgentActionRow
          disabled={rowDisabled}
          icon={Sparkles}
          label="Create trading card"
          onClick={onCreateCard}
          testId="user-profile-create-card-row"
          title={directOff ? directHint : undefined}
        />
      ) : null}
      {supplementalAction}
      {canArchiveAgent ? (
        <ProfileArchiveAgentRow archiveActions={archiveActions} />
      ) : null}
      {canDeleteAgent ? (
        <ProfileDeleteAgentRow
          isPending={isDeletePending}
          managedAgent={managedAgent}
          onDelete={onDeleteAgent}
          directOff={directOff}
          directHint={directHint}
        />
      ) : null}
    </PanelSectionGroup>
  );
}

export function ProfileAgentActionRow({
  destructive = false,
  disabled = false,
  icon: Icon,
  iconClassName,
  label,
  onClick,
  testId,
  title,
}: {
  destructive?: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  onClick: () => void;
  testId: string;
  title?: string;
}) {
  return (
    <button
      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      data-testid={testId}
      disabled={disabled}
      title={title}
      onClick={onClick}
      type="button"
    >
      <Icon
        className={
          iconClassName ??
          (destructive
            ? "h-4 w-4 shrink-0 text-destructive"
            : "h-4 w-4 shrink-0 text-muted-foreground")
        }
        data-slot="profile-action-icon"
      />
      <span
        className={
          destructive
            ? "min-w-0 flex-1 text-sm font-medium text-destructive"
            : "min-w-0 flex-1 text-sm font-medium"
        }
      >
        {label}
      </span>
    </button>
  );
}

function ProfileArchiveAgentRow({
  archiveActions,
}: {
  archiveActions: IdentityArchiveActions;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const { off: directOff, hint: directHint } = useDirectControlsOff();
  const isArchived = archiveActions.isArchived === true;
  const Icon = isArchived ? ArchiveRestore : Archive;
  const label = archiveActions.isPending
    ? isArchived
      ? "Unarchiving…"
      : "Archiving…"
    : isArchived
      ? "Unarchive agent"
      : "Archive agent";

  return (
    <>
      <ProfileAgentActionRow
        disabled={archiveActions.isPending || directOff}
        icon={Icon}
        label={label}
        title={directOff ? directHint : undefined}
        onClick={() => {
          if (directOff) return;
          if (isArchived) {
            archiveActions.unarchive();
            return;
          }
          setConfirmOpen(true);
        }}
        testId={
          isArchived
            ? "user-profile-unarchive-agent-row"
            : "user-profile-archive-agent-row"
        }
      />
      <ArchiveConfirmDialog
        isBot
        isPending={archiveActions.isPending}
        onConfirm={() => {
          archiveActions.archive();
          setConfirmOpen(false);
        }}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
      />
    </>
  );
}

function ProfileDeleteAgentRow({
  isPending,
  managedAgent,
  onDelete,
  directOff = false,
  directHint,
}: {
  isPending: boolean;
  managedAgent?: ManagedAgent;
  onDelete: () => void;
  directOff?: boolean;
  directHint?: string;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  return (
    <>
      <ProfileAgentActionRow
        destructive
        disabled={isPending || directOff}
        icon={Trash2}
        label="Delete agent"
        title={directOff ? directHint : undefined}
        onClick={() => {
          if (directOff) return;
          if (managedAgent) {
            setConfirmOpen(true);
            return;
          }
          onDelete();
        }}
        testId="user-profile-delete-agent-row"
      />
      {managedAgent ? (
        <AgentDeleteConfirmDialog
          agent={managedAgent}
          isPending={isPending}
          onConfirm={() => {
            setConfirmOpen(false);
            onDelete();
          }}
          onOpenChange={setConfirmOpen}
          open={confirmOpen}
        />
      ) : null}
    </>
  );
}

function AgentDeleteConfirmDialog({
  agent,
  isPending,
  onConfirm,
  onOpenChange,
  open,
}: {
  agent: ManagedAgent;
  isPending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const isProviderAgent = agent.backend.type === "provider";

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent data-testid="agent-delete-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this agent?</AlertDialogTitle>
          <AlertDialogDescription>
            {isProviderAgent
              ? "Deleting removes this agent’s local management record, not its remote deployment."
              : "Deleting this agent stops and removes the agent from this community."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Removes the local management record and saved agent key</li>
          <li>Removes the agent from every channel it belongs to</li>
          <li>
            Archives the agent&apos;s identity on the relay so it no longer
            appears in member lists or mention suggestions
          </li>
          <li>
            {isProviderAgent
              ? "Unless the agent is known to be Offline, Buzz first requests shutdown through a channel when available. A failed request cancels deletion. The remote process may still be running even after a successful request."
              : "Stops any local agent process before deleting the record"}
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Archive this agent if you want to hide it instead of removing it.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            data-testid="agent-delete-confirm-action"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? "Deleting…" : "Delete agent"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
