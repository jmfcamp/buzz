import { isTauri } from "@tauri-apps/api/core";
import { ArrowLeft, ArrowRight, Compass, RefreshCw } from "lucide-react";
import * as React from "react";

import { TopChromeInsetHeader } from "@/shared/layout/TopChromeInsetHeader";
import { Button } from "@/shared/ui/button";

import { usePinnedSite } from "../hooks";
import { getPinnedSiteIcon } from "../lib/icons";
import {
  getPinWebviewNavState,
  hidePinWebview,
  pinWebviewGoBack,
  pinWebviewGoForward,
  pinWebviewReload,
  pollPinWebview,
  setPinWebviewBounds,
  showPinWebview,
  subscribePinWebviewNav,
  type PinWebviewBounds,
  type PinWebviewNavState,
} from "../lib/pinWebview";
import { PINNED_SITES_POLL_INTERVAL_MS } from "../lib/types";

export function PinnedSiteScreen({ pinId }: { pinId: string }) {
  const pin = usePinnedSite(pinId);
  const Icon = pin ? getPinnedSiteIcon(pin.icon) : Compass;

  if (!pin) {
    return (
      <div
        className="flex h-full min-h-0 flex-col"
        data-testid="pinned-site-view"
      >
        <TopChromeInsetHeader data-tauri-drag-region>
          <header className="flex h-9 items-center px-5">
            <p className="text-sm text-muted-foreground">
              Pinned site not found
            </p>
          </header>
        </TopChromeInsetHeader>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="pinned-site-view"
    >
      <PinnedSiteChrome
        icon={<Icon className="h-4 w-4" />}
        pinId={pin.id}
        startUrl={pin.url}
        title={pin.name}
      />
      <PinnedSiteSurface
        pinId={pin.id}
        pollForChanges={pin.pollForChanges}
        startUrl={pin.url}
      />
    </div>
  );
}

function PinnedSiteChrome({
  icon,
  pinId,
  startUrl,
  title,
}: {
  icon: React.ReactNode;
  pinId: string;
  startUrl: string;
  title: string;
}) {
  const [nav, setNav] = React.useState<PinWebviewNavState>({
    canGoBack: false,
    canGoForward: false,
    currentUrl: startUrl,
  });

  React.useEffect(() => {
    let cancelled = false;
    void getPinWebviewNavState(pinId).then((state) => {
      if (!cancelled) setNav(state);
    });
    const unlisten = subscribePinWebviewNav((payload) => {
      if (payload.pinId === pinId) {
        setNav(payload);
      }
    });
    return () => {
      cancelled = true;
      void unlisten.then((stop) => stop());
    };
  }, [pinId]);

  return (
    <TopChromeInsetHeader data-tauri-drag-region>
      <header className="flex h-9 min-w-0 items-center gap-2 px-3">
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            aria-label="Back"
            data-testid="pinned-site-back"
            disabled={!nav.canGoBack}
            onClick={() => {
              void pinWebviewGoBack(pinId).then(setNav);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Forward"
            data-testid="pinned-site-forward"
            disabled={!nav.canGoForward}
            onClick={() => {
              void pinWebviewGoForward(pinId).then(setNav);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Refresh"
            data-testid="pinned-site-refresh"
            onClick={() => {
              void pinWebviewReload(pinId);
            }}
            size="icon"
            type="button"
            variant="ghost"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h1 className="truncate text-sm font-medium">{title}</h1>
        </div>
      </header>
    </TopChromeInsetHeader>
  );
}

function readBounds(element: HTMLElement): PinWebviewBounds {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function PinnedSiteSurface({
  pinId,
  pollForChanges,
  startUrl,
}: {
  pinId: string;
  pollForChanges: boolean;
  startUrl: string;
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const native = isTauri() || import.meta.env.MODE === "e2e";

  React.useEffect(() => {
    if (!native) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;

    void showPinWebview({
      pinId,
      startUrl,
      bounds: readBounds(host),
    }).catch((error) => {
      console.error("Failed to open pinned site", error);
    });

    const observer = new ResizeObserver(() => {
      if (cancelled || !hostRef.current) return;
      void setPinWebviewBounds(pinId, readBounds(hostRef.current));
    });
    observer.observe(host);

    return () => {
      cancelled = true;
      observer.disconnect();
      void hidePinWebview(pinId);
    };
  }, [native, pinId, startUrl]);

  React.useEffect(() => {
    if (!native || !pollForChanges) return;
    const timer = window.setInterval(() => {
      void pollPinWebview(pinId, startUrl)
        .then((result) => {
          if (result.changed) {
            void pinWebviewReload(pinId);
          }
        })
        .catch((error) => {
          console.warn("Pinned site poll failed", error);
        });
    }, PINNED_SITES_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [native, pinId, pollForChanges, startUrl]);

  return (
    <div
      className="relative min-h-0 min-w-0 flex-1 bg-background"
      data-testid="pinned-site-surface"
      ref={hostRef}
    >
      {native ? null : (
        <div className="flex h-full items-center justify-center px-8 text-center text-sm text-muted-foreground">
          Open this pin in the Buzz desktop app to keep the page and login.
        </div>
      )}
    </div>
  );
}
