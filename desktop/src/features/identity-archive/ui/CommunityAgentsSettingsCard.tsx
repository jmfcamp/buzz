import { Archive, ArchiveRestore, Bot } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { ArchiveConfirmDialog } from "@/features/profile/ui/ArchiveConfirmDialog";
import { SettingsOptionGroup } from "@/features/settings/ui/SettingsOptionGroup";
import { SettingsSectionHeader } from "@/features/settings/ui/SettingsSectionHeader";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

import type { CommunityAgentListItem } from "../communityAgents";
import {
  useArchiveIdentityMutation,
  useUnarchiveIdentityMutation,
} from "../hooks";
import { useCommunityAgentsForArchive } from "../useCommunityAgents";

export function CommunityAgentsSettingsCard() {
  const { agents, isLoading } = useCommunityAgentsForArchive();
  const archiveMutation = useArchiveIdentityMutation();
  const unarchiveMutation = useUnarchiveIdentityMutation();
  const [pendingPubkey, setPendingPubkey] = React.useState<string | null>(null);

  const isPending = archiveMutation.isPending || unarchiveMutation.isPending;

  function handleArchive(agent: CommunityAgentListItem) {
    setPendingPubkey(agent.pubkey);
    archiveMutation.mutate(
      { targetPubkey: agent.pubkey },
      {
        onSuccess: () => toast.success("Archived on this relay"),
        onError: (error) =>
          toast.error(
            `Archive failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        onSettled: () => setPendingPubkey(null),
      },
    );
  }

  function handleUnarchive(agent: CommunityAgentListItem) {
    setPendingPubkey(agent.pubkey);
    unarchiveMutation.mutate(
      { targetPubkey: agent.pubkey },
      {
        onSuccess: () => toast.success("Unarchived on this relay"),
        onError: (error) =>
          toast.error(
            `Unarchive failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        onSettled: () => setPendingPubkey(null),
      },
    );
  }

  return (
    <section className="min-w-0" data-testid="settings-community-agents">
      <SettingsSectionHeader
        description="Archive leftover or unused community agents so they leave @ mentions and other pickers. Unarchive restores them. This uses the same Archive action as a profile."
        title="Community agents"
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading agents…</p>
      ) : (
        <SettingsOptionGroup
          description="Includes installed catalog bots and leftover bot-role channel members that uninstall left behind."
          title="Agents in this community"
        >
          {agents.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No community agents yet.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {agents.map((agent) => (
                <CommunityAgentRow
                  agent={agent}
                  isPending={isPending && pendingPubkey === agent.pubkey}
                  key={agent.pubkey}
                  onArchive={handleArchive}
                  onUnarchive={handleUnarchive}
                />
              ))}
            </div>
          )}
        </SettingsOptionGroup>
      )}
    </section>
  );
}

function CommunityAgentRow({
  agent,
  isPending,
  onArchive,
  onUnarchive,
}: {
  agent: CommunityAgentListItem;
  isPending: boolean;
  onArchive: (agent: CommunityAgentListItem) => void;
  onUnarchive: (agent: CommunityAgentListItem) => void;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-4 py-3"
      data-testid={`settings-community-agent-${agent.pubkey}`}
    >
      <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{agent.displayName}</p>
          {agent.archived ? (
            <Badge
              data-testid={`settings-community-agent-archived-${agent.pubkey}`}
              variant="secondary"
            >
              Archived
            </Badge>
          ) : null}
          {agent.source === "leftover" ? (
            <Badge
              data-testid={`settings-community-agent-leftover-${agent.pubkey}`}
              variant="outline"
            >
              Leftover
            </Badge>
          ) : null}
        </div>
        <p className="truncate font-mono text-2xs text-muted-foreground">
          {agent.truncatedPubkey}
        </p>
      </div>
      {agent.archived ? (
        <Button
          data-testid={`settings-community-agent-unarchive-${agent.pubkey}`}
          disabled={isPending}
          onClick={() => onUnarchive(agent)}
          size="sm"
          type="button"
          variant="outline"
        >
          <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
          {isPending ? "Unarchiving…" : "Unarchive"}
        </Button>
      ) : (
        <Button
          data-testid={`settings-community-agent-archive-${agent.pubkey}`}
          disabled={isPending}
          onClick={() => setConfirmOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Archive className="mr-1.5 h-3.5 w-3.5" />
          Archive
        </Button>
      )}
      <ArchiveConfirmDialog
        isBot
        isPending={isPending}
        onConfirm={() => {
          onArchive(agent);
          setConfirmOpen(false);
        }}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
      />
    </div>
  );
}
