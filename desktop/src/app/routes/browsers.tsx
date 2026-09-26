import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const BrowsersScreen = React.lazy(async () => {
  const module = await import("@/features/browsers/ui/BrowsersScreen");
  return { default: module.BrowsersScreen };
});

export const Route = createFileRoute("/browsers")({
  component: BrowsersRouteComponent,
});

function BrowsersRouteComponent() {
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="browsers" />}>
      <BrowsersScreen />
    </React.Suspense>
  );
}
