import * as React from "react";

import { useManagedAgentsQuery } from "@/features/agents/hooks";
import { useCommunityBotsQuery } from "@/features/community-bots/hooks";
import { useIsArchivedPredicate } from "@/features/identity-archive/hooks";
import {
  codingAgentChoices,
  type CodingAgentChoice,
} from "@/features/projects/lib/projectCodingAgent";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import { resolveUserLabel } from "@/features/profile/lib/identity";

export type CodingAgentOption = CodingAgentChoice & {
  label: string;
};

/**
 * Local bots and community bots for the coding-agent picker.
 * Human relay members are not queried, so they cannot appear.
 */
export function useCodingAgentOptions(enabled = true) {
  const agentsQuery = useManagedAgentsQuery({ enabled });
  const botsQuery = useCommunityBotsQuery(enabled);
  const isArchived = useIsArchivedPredicate();
  const ready = agentsQuery.isSuccess && botsQuery.isSuccess;
  const failed = agentsQuery.isError || botsQuery.isError;
  const choices = React.useMemo(
    () =>
      ready && !failed
        ? codingAgentChoices({
            communityBots: botsQuery.data ?? [],
            isArchived,
            localAgents: agentsQuery.data ?? [],
          })
        : [],
    [agentsQuery.data, botsQuery.data, failed, isArchived, ready],
  );
  const profilesQuery = useUsersBatchQuery(
    choices.map((choice) => choice.pubkey),
    { enabled: enabled && choices.length > 0 },
  );
  const options = React.useMemo<CodingAgentOption[]>(() => {
    const profiles = profilesQuery.data?.profiles;
    return choices
      .map((choice) => {
        const profile = profiles?.[choice.pubkey];
        return {
          ...choice,
          avatarUrl: profile?.avatarUrl ?? choice.avatarUrl,
          label: resolveUserLabel({
            communityBots: botsQuery.data,
            fallbackName: choice.name,
            preferResolvedSelfLabel: true,
            profiles,
            pubkey: choice.pubkey,
          }),
        };
      })
      .sort(
        (left, right) =>
          left.label.localeCompare(right.label) ||
          left.pubkey.localeCompare(right.pubkey),
      );
  }, [botsQuery.data, choices, profilesQuery.data?.profiles]);

  return { failed, options, ready: ready && !failed };
}
