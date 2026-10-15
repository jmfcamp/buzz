// Web side of the desktop-run Assistant features (jobs, coffee chats, scratchpad, threads): read and act over Direct.
// Without Direct the sections render disabled with a "Needs Direct" note.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { proxyDirectLive, subscribeProxy } from "@/features/bridge/remoteCmd";
import { useCommunities } from "@/features/communities/useCommunities";
import { useIdentityQuery } from "@/shared/api/hooks";
import { invokeTauri } from "@/shared/api/tauri";

import type { AssistantDataKind } from "./directBackend";

export function useDirectLive(): boolean {
  return React.useSyncExternalStore(
    subscribeProxy,
    proxyDirectLive,
    () => false,
  );
}

function useScopeArgs() {
  const me = useIdentityQuery().data?.pubkey?.toLowerCase();
  const relay = useCommunities().activeCommunity?.relayUrl;
  return me && relay
    ? { expectedRelayUrl: relay, expectedSignerPubkey: me }
    : null;
}

const key = (kind: AssistantDataKind, scope: object | null) =>
  ["assistant-direct", kind, scope] as const;

/** State of a desktop Assistant feature over Direct; null while Direct is down or the desktop has no Assistant. */
export function useAssistantData<T>(kind: AssistantDataKind): {
  data: T | null;
  live: boolean;
  loading: boolean;
  error: string | null;
  act: (action: string, payload?: Record<string, unknown>) => Promise<void>;
} {
  const live = useDirectLive();
  const scope = useScopeArgs();
  const qc = useQueryClient();
  const q = useQuery({
    enabled: live && scope !== null,
    queryKey: key(kind, scope),
    queryFn: () =>
      invokeTauri<T | null>("assistant_data_get", { kind, ...scope }),
    refetchInterval: 8_000,
    staleTime: 2_000,
  });
  const act = React.useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      if (!scope) throw new Error("Not signed in.");
      const next = await invokeTauri<T | null>("assistant_data_act", {
        kind,
        action,
        payload,
        ...scope,
      });
      qc.setQueryData(key(kind, scope), next);
    },
    [kind, scope, qc],
  );
  return {
    data: live ? ((q.data as T | null | undefined) ?? null) : null,
    live,
    loading: live && q.isLoading,
    error: q.error instanceof Error ? q.error.message : null,
    act,
  };
}
