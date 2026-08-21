import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const BotsScreen = React.lazy(async () => {
  const module = await import("@/features/community-bots/ui/BotsScreen");
  return { default: module.BotsScreen };
});

export const Route = createFileRoute("/bots/$botId")({
  component: BotDetailRouteComponent,
});

function BotDetailRouteComponent() {
  const { botId } = Route.useParams();

  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="bots" />}>
      <BotsScreen selectedBotId={botId} />
    </React.Suspense>
  );
}
