import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { botsDirectorySelectedBotId } from "@/features/community-bots/lib/directory";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

export type BotsRouteSearch = {
  bot?: string;
};

function validateBotsSearch(search: Record<string, unknown>): BotsRouteSearch {
  const bot = botsDirectorySelectedBotId(
    typeof search.bot === "string" ? search.bot : null,
  );
  return bot ? { bot } : {};
}

const BotsScreen = React.lazy(async () => {
  const module = await import("@/features/community-bots/ui/BotsScreen");
  return { default: module.BotsScreen };
});

export const Route = createFileRoute("/bots")({
  validateSearch: validateBotsSearch,
  component: BotsRouteComponent,
});

function BotsRouteComponent() {
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="bots" />}>
      <BotsScreen />
    </React.Suspense>
  );
}
