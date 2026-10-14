import * as React from "react";
import { isTauri } from "@tauri-apps/api/core";
import { createFileRoute } from "@tanstack/react-router";

import { PinnedSiteScreen } from "@/features/pinned-sites/ui/PinnedSiteScreen";
import { WebPinnedSiteLauncher } from "@/features/pinned-sites/ui/WebPinnedSiteLauncher";
import { WebPinFrameSlot } from "@/features/pinned-sites/ui/WebPinFrameHost";
import { useWebPinOpenInBuzz } from "@/features/pinned-sites/lib/webPinOpen";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

export const Route = createFileRoute("/pins/$pinId")({
  component: PinnedSiteRouteComponent,
});

function PinnedSiteRouteComponent() {
  const { pinId } = Route.useParams();
  // Desktop: native webview. Web/PWA: pins open in the default browser; a direct /pins/<id> URL shows a launcher.
  if (!isTauri()) return <WebPinnedSiteRoute pinId={pinId} />;
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="agents" />}>
      {/* key: a pin switch must remount with fresh per-pin state — never reuse
          the previous pin's startUrl for the next pin's webview. */}
      <PinnedSiteScreen key={pinId} pinId={pinId} />
    </React.Suspense>
  );
}

/** Web: "Open with Buzz" pins show their live frame (kept alive by WebPinFrameHost); others a one-tap launcher. */
function WebPinnedSiteRoute({ pinId }: { pinId: string }) {
  const inBuzz = useWebPinOpenInBuzz(pinId);
  return inBuzz ? <WebPinFrameSlot pinId={pinId} /> : <WebPinnedSiteLauncher pinId={pinId} />;
}
