import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { isValidProjectDri } from "@/features/projects/lib/projectDri";
import type { Project } from "@/features/projects/projectModels";
import { useCodingAgentOptions } from "@/features/projects/useCodingAgentOptions";
import { useHumanRelayDriOptions } from "@/features/projects/useHumanRelayDriOptions";
import { useSetProjectCodingAgentMutation } from "@/features/projects/useSetProjectCodingAgent";
import { useSetProjectDriMutation } from "@/features/projects/useSetProjectDri";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import { resolveUserLabel } from "@/features/profile/lib/identity";
import { useIdentityQuery } from "@/shared/api/hooks";
import {
  ProjectCodingAgentIdentity,
  useProjectCodingAgent,
} from "./ProjectCodingAgentIdentity";
import { ProjectDriIdentity } from "./ProjectDriIdentity";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { Button } from "@/shared/ui/button";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

/**
 * Header control beside the codebase name.
 * DRI and coding agent each have their own menu. Saving one does not clear
 * the other: DRI rewrites the `dri` tag, and the coding agent rewrites
 * `coding-agent` plus channel membership.
 * The DRI menu lists human relay members. The coding-agent menu lists local
 * bots and community bots, each with an avatar and name.
 */
export function ProjectChannelDriControl({
  project,
  separator = false,
}: {
  project: Project;
  separator?: boolean;
}) {
  const identityQuery = useIdentityQuery();
  const driMutation = useSetProjectDriMutation();
  const codingAgentMutation = useSetProjectCodingAgentMutation();
  const { failed, options, ready } = useHumanRelayDriOptions();
  const codingAgents = useCodingAgentOptions();
  const dri =
    project.dri && isValidProjectDri(project.dri)
      ? normalizePubkey(project.dri)
      : null;
  const profileQuery = useUsersBatchQuery(dri ? [dri] : [], {
    enabled: Boolean(dri),
  });
  const owner = normalizePubkey(project.owner);
  const viewer = identityQuery.data?.pubkey
    ? normalizePubkey(identityQuery.data.pubkey)
    : null;
  const canEdit = viewer === owner;
  const codingAgent = useProjectCodingAgent(
    project.projectChannelId,
    project.codingAgent,
  );
  const driName = dri
    ? resolveUserLabel({
        currentPubkey: identityQuery.data?.pubkey,
        preferResolvedSelfLabel: true,
        profiles: profileQuery.data?.profiles,
        pubkey: dri,
      })
    : null;
  const codingAgentPubkey = codingAgent
    ? normalizePubkey(codingAgent.pubkey)
    : null;
  const codingAgentName = codingAgentPubkey
    ? (codingAgents.options.find(
        (option) => option.pubkey === codingAgentPubkey,
      )?.label ??
      codingAgent?.name?.trim() ??
      null)
    : null;

  async function saveDri(pubkey: string) {
    if (pubkey === dri) return;
    try {
      await driMutation.mutateAsync({ driPubkey: pubkey, project });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not set the DRI.",
      );
    }
  }

  async function saveCodingAgent(pubkey: string) {
    if (pubkey === codingAgentPubkey) return;
    try {
      await codingAgentMutation.mutateAsync({
        codingAgentPubkey: pubkey,
        project,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not set the coding agent.",
      );
    }
  }

  if (!driName && !canEdit && !codingAgent) return null;

  const driMenu = canEdit ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={driName ? `Change DRI, currently ${driName}` : "Set DRI"}
          className="h-6 max-w-[14rem] gap-1 px-1.5 text-xs font-medium text-foreground"
          data-testid="project-channel-dri-control"
          disabled={driMutation.isPending}
          size="sm"
          type="button"
          variant="ghost"
        >
          {driName ? null : <span>Set DRI</span>}
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-56 overflow-y-auto"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.pubkey}
            onSelect={() => {
              void saveDri(option.pubkey);
            }}
          >
            <UserAvatar
              avatarUrl={option.avatarUrl}
              displayName={option.label}
              shape="circle"
              size="xs"
            />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.pubkey === dri ? (
              <span className="ml-auto text-xs text-muted-foreground">DRI</span>
            ) : null}
          </DropdownMenuItem>
        ))}
        {!ready && !failed ? (
          <DropdownMenuItem disabled>Loading members…</DropdownMenuItem>
        ) : null}
        {failed ? (
          <DropdownMenuItem disabled>Couldn't load members.</DropdownMenuItem>
        ) : null}
        {ready && options.length === 0 ? (
          <DropdownMenuItem disabled>No community members.</DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  const codingAgentMenu = canEdit ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={
            codingAgent
              ? `Change CA, currently ${codingAgentName ?? "this bot"}`
              : "Set CA"
          }
          className="h-6 max-w-[14rem] gap-1 px-1.5 text-xs font-medium text-foreground"
          data-testid="project-channel-coding-agent-control"
          disabled={codingAgentMutation.isPending}
          size="sm"
          type="button"
          variant="ghost"
        >
          {codingAgent ? null : <span>Set CA</span>}
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-56 overflow-y-auto"
      >
        {codingAgents.options.map((option) => (
          <DropdownMenuItem
            data-testid={`project-channel-coding-agent-option-${option.pubkey}`}
            key={option.pubkey}
            onSelect={() => {
              void saveCodingAgent(option.pubkey);
            }}
          >
            <UserAvatar
              avatarUrl={option.avatarUrl}
              displayName={option.label}
              shape="squircle"
              size="xs"
            />
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.pubkey === codingAgentPubkey ? (
              <span className="ml-auto text-xs text-muted-foreground">CA</span>
            ) : null}
          </DropdownMenuItem>
        ))}
        {!codingAgents.ready && !codingAgents.failed ? (
          <DropdownMenuItem disabled>Loading bots…</DropdownMenuItem>
        ) : null}
        {codingAgents.failed ? (
          <DropdownMenuItem disabled>Couldn't load bots.</DropdownMenuItem>
        ) : null}
        {codingAgents.ready && codingAgents.options.length === 0 ? (
          <DropdownMenuItem disabled>
            No local or community bots.
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <span
      className="flex min-w-0 items-center gap-1.5"
      data-testid="project-channel-dri"
    >
      {dri ? (
        <ProjectDriIdentity
          profiles={profileQuery.data?.profiles}
          pubkey={dri}
        />
      ) : null}
      {driMenu}
      {codingAgent ? <ProjectCodingAgentIdentity agent={codingAgent} /> : null}
      {codingAgentMenu}
      {separator ? (
        <span aria-hidden="true" className="shrink-0 text-muted-foreground/40">
          ·
        </span>
      ) : null}
    </span>
  );
}
