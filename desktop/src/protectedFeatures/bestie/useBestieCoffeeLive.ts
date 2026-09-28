import * as React from "react";

import { useAgentWorking } from "@/features/agents/agentWorkingSignal";
import { useChannelMessagesQuery } from "@/features/messages/hooks";
import { normalizePubkey } from "@/shared/lib/pubkey";
import type { Channel } from "@/shared/api/types";

import {
  isBestieCoffeeLive,
  isBestieCoffeePendingStale,
  messageLooksLikeBestieCoffeeTrigger,
  shouldDisableBestieCoffeeBrew,
} from "./bestieCoffeeLive";
import {
  clearBestieCoffeePendingRunForScope,
  useBestieCoffee,
} from "./bestieCoffeeStore";
import type { BestieCoffeeScope } from "./bestieCoffeeTypes";

/**
 * Brewing UI for Coffee RHS: ties disable + 🤔… to the real in-flight coffee
 * turn (ACP agent working on Assistant DM + pending/grace), not a fake spinner.
 */
export function useBestieCoffeeLive(
  scope: BestieCoffeeScope | null,
  bestieChannel: Channel | null | undefined,
): {
  brewDisabled: boolean;
  coffeeLive: boolean;
} {
  const coffeeState = useBestieCoffee(scope);
  const agentPubkey = scope?.agentPubkey ?? null;
  const channelId = bestieChannel?.id ?? null;
  const working = useAgentWorking(agentPubkey, channelId);
  const messagesQuery = useChannelMessagesQuery(bestieChannel ?? null);

  const pendingRun = coffeeState.pendingRun;
  const tickWhilePending = pendingRun != null;
  const [nowSeconds, setNowSeconds] = React.useState(() =>
    Math.floor(Date.now() / 1000),
  );
  React.useEffect(() => {
    if (!tickWhilePending) return;
    setNowSeconds(Math.floor(Date.now() / 1000));
    const timer = window.setInterval(() => {
      setNowSeconds(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [tickWhilePending, pendingRun?.startedAt]);

  const openCoffeeTriggerAt = React.useMemo(() => {
    if (!scope || !agentPubkey) return null;
    const owner = normalizePubkey(scope.ownerPubkey);
    const events = messagesQuery.data ?? [];
    const lastEntryRanAt = coffeeState.entries[0]?.ranAt ?? 0;
    let latest: number | null = null;
    for (const event of events) {
      if (typeof event.content !== "string") continue;
      if (normalizePubkey(event.pubkey) !== owner) continue;
      if (!messageLooksLikeBestieCoffeeTrigger(event.content)) continue;
      const createdAt =
        typeof event.created_at === "number"
          ? event.created_at
          : Math.floor(Date.now() / 1000);
      // Ignore triggers already folded into a completed entry.
      if (createdAt + 5 < lastEntryRanAt) continue;
      if (latest == null || createdAt > latest) latest = createdAt;
    }
    return latest;
  }, [
    agentPubkey,
    coffeeState.entries,
    messagesQuery.data,
    scope,
  ]);

  const agentWorkingOnBestieDm = working.working;

  // Drop abandoned pending locks so Brew cannot stay disabled forever.
  React.useEffect(() => {
    if (!scope) return;
    if (
      !isBestieCoffeePendingStale({
        agentWorkingOnBestieDm,
        nowSeconds,
        pendingRun,
      })
    ) {
      return;
    }
    clearBestieCoffeePendingRunForScope(scope);
  }, [agentWorkingOnBestieDm, nowSeconds, pendingRun, scope]);

  const coffeeLive = isBestieCoffeeLive({
    agentWorkingOnBestieDm,
    nowSeconds,
    openCoffeeTriggerAt,
    pendingRun,
  });
  const brewDisabled = shouldDisableBestieCoffeeBrew({
    agentWorkingOnBestieDm,
    nowSeconds,
    openCoffeeTriggerAt,
    pendingRun,
  });

  return { brewDisabled, coffeeLive };
}
