import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { PinnedSiteScreen } from "@/features/pinned-sites/ui/PinnedSiteScreen";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

export const Route = createFileRoute("/pins/$pinId")({
  component: PinnedSiteRouteComponent,
});

function PinnedSiteRouteComponent() {
  const { pinId } = Route.useParams();
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="agents" />}>
      <PinnedSiteScreen pinId={pinId} />
    </React.Suspense>
  );
}
