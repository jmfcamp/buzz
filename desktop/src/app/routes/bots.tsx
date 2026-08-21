import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const BotsScreen = React.lazy(async () => {
  const module = await import("@/features/community-bots/ui/BotsScreen");
  return { default: module.BotsScreen };
});

export const Route = createFileRoute("/bots")({
  component: BotsRouteComponent,
});

function BotsRouteComponent() {
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="bots" />}>
      <BotsScreen selectedBotId={null} />
    </React.Suspense>
  );
}
