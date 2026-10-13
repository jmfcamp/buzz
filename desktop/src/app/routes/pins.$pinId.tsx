import * as React from "react";
import { isTauri } from "@tauri-apps/api/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MonitorSmartphone } from "lucide-react";

import { PinnedSiteScreen } from "@/features/pinned-sites/ui/PinnedSiteScreen";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

export const Route = createFileRoute("/pins/$pinId")({
  component: PinnedSiteRouteComponent,
});

function PinnedSiteRouteComponent() {
  const { pinId } = Route.useParams();
  // Pinned sites are native desktop webviews; a synced pin tab on web shows a calm card.
  if (!isTauri()) return <PinnedSiteDesktopOnly />;
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="agents" />}>
      {/* key: a pin switch must remount with fresh per-pin state — never reuse
          the previous pin's startUrl for the next pin's webview. */}
      <PinnedSiteScreen key={pinId} pinId={pinId} />
    </React.Suspense>
  );
}

function PinnedSiteDesktopOnly() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
      <div
        className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-5 text-center text-card-foreground shadow-sm"
        data-testid="pinned-site-desktop-only"
        role="note"
      >
        <MonitorSmartphone
          aria-hidden
          className="mx-auto mb-3 h-6 w-6 text-muted-foreground"
        />
        <p className="text-sm font-medium">Desktop only</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This pinned site runs inside the desktop app. Open it there; this tab
          stays in sync.
        </p>
        <button
          className="mt-4 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          onClick={() => void navigate({ to: "/" })}
          type="button"
        >
          Go Home
        </button>
      </div>
    </div>
  );
}
