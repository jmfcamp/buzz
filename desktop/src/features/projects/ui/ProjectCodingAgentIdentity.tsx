import * as React from "react";

import { useManagedAgentsQuery } from "@/features/agents/hooks";
import { useChannelMembersQuery } from "@/features/channels/hooks";
import { useCommunityBotsQuery } from "@/features/community-bots/hooks";
import {
  requireProjectCodingAgent,
  selectProjectCodingAgent,
  type ProjectCodingAgentRecord,
} from "@/features/projects/lib/projectCodingAgent";
import { resolveUserLabel } from "@/features/profile/lib/identity";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import { UserProfilePopover } from "@/features/profile/ui/UserProfilePopover";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { UserAvatar } from "@/shared/ui/UserAvatar";

export const CODING_AGENT_TOOLTIP = "Coding Agent";

function designatedPubkeyOrNull(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  try {
    return requireProjectCodingAgent(value);
  } catch {
    return null;
  }
}

/**
 * Coding agent for a project. A stored `coding-agent` pubkey wins, including
 * a community bot. With no tag, the create-time local persona on the channel
 * is used. Changing DRI does not change this.
 */
export function useProjectCodingAgent(
  channelId: string | null | undefined,
  designatedPubkey?: string | null,
) {
  const id = channelId?.trim() ? channelId : null;
  const designated = designatedPubkeyOrNull(designatedPubkey);
  const membersQuery = useChannelMembersQuery(id);
  const agentsQuery = useManagedAgentsQuery({
    enabled: id !== null || designated !== null,
  });
  const botsQuery = useCommunityBotsQuery(designated !== null);
  return React.useMemo(() => {
    if (designated) {
      const local = (agentsQuery.data ?? []).find(
        (agent) => normalizePubkey(agent.pubkey) === designated,
      );
      if (local) return local;
      const bot = (botsQuery.data ?? []).find(
        (candidate) => normalizePubkey(candidate.pubkey) === designated,
      );
      if (bot) {
        return {
          avatarUrl: null,
          name: bot.name,
          pubkey: designated,
        } satisfies ProjectCodingAgentRecord;
      }
      return { avatarUrl: null, name: null, pubkey: designated };
    }
    return selectProjectCodingAgent(membersQuery.data, agentsQuery.data);
  }, [agentsQuery.data, botsQuery.data, designated, membersQuery.data]);
}

/**
 * CA label plus avatar only. Hover says "Coding Agent".
 * Clicking the avatar opens the existing profile panel.
 */
export function ProjectCodingAgentIdentity({
  agent,
}: {
  agent: ProjectCodingAgentRecord;
}) {
  const normalized = normalizePubkey(agent.pubkey);
  const profileQuery = useUsersBatchQuery([normalized], {
    enabled: normalized.length > 0,
  });
  const profiles = profileQuery.data?.profiles;
  const profile = profiles?.[normalized];
  const name = resolveUserLabel({
    fallbackName: agent.name,
    preferResolvedSelfLabel: true,
    profiles,
    pubkey: normalized,
  });
  const avatarUrl = profile?.avatarUrl ?? agent.avatarUrl ?? null;

  return (
    <span
      className="flex min-w-0 shrink items-center gap-1.5 text-xs font-normal text-muted-foreground"
      data-testid="project-coding-agent"
      title={CODING_AGENT_TOOLTIP}
    >
      <span className="shrink-0">CA</span>
      <UserProfilePopover
        pubkey={normalized}
        triggerAriaLabel={`Coding Agent ${name}`}
        triggerClassName="shrink-0"
        triggerElement="span"
        triggerTestId="project-coding-agent-profile"
      >
        <UserAvatar
          avatarUrl={avatarUrl}
          displayName={name}
          shape="squircle"
          size="xs"
        />
      </UserProfilePopover>
    </span>
  );
}

/** Renders nothing when this project channel has no coding agent. */
export function ProjectCodingAgentChip({
  channelId,
  designatedPubkey,
}: {
  channelId: string | null | undefined;
  /** Stored `coding-agent` pubkey. Omit to use the create-time channel bot. */
  designatedPubkey?: string | null;
}) {
  const agent = useProjectCodingAgent(channelId, designatedPubkey);
  if (!agent) return null;
  return <ProjectCodingAgentIdentity agent={agent} />;
}
