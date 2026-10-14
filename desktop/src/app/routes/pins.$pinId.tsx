import * as React from "react";
import { isTauri } from "@tauri-apps/api/core";
import { createFileRoute } from "@tanstack/react-router";

import { PinnedSiteScreen } from "@/features/pinned-sites/ui/PinnedSiteScreen";
import { WebPinnedSiteFrame } from "@/features/pinned-sites/ui/WebPinnedSiteFrame";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

export const Route = createFileRoute("/pins/$pinId")({
  component: PinnedSiteRouteComponent,
});

function PinnedSiteRouteComponent() {
  const { pinId } = Route.useParams();
  // Desktop: native webview. Web/PWA: sandboxed iframe panel with an "Open in new tab" fallback.
  if (!isTauri()) return <WebPinnedSiteFrame key={pinId} pinId={pinId} />;
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="agents" />}>
      {/* key: a pin switch must remount with fresh per-pin state — never reuse
          the previous pin's startUrl for the next pin's webview. */}
      <PinnedSiteScreen key={pinId} pinId={pinId} />
    </React.Suspense>
  );
}
