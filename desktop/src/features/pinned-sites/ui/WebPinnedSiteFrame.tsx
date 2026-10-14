import * as React from "react";
import { ExternalLink, Globe, RotateCw, X } from "lucide-react";

import { openExternalUrl } from "@/shared/lib/externalLinks";

import type { PinnedSite } from "../lib/types";
import {
  isFrameableScheme,
  isKnownFrameBlockedUrl,
  WEB_PIN_FRAME_SANDBOX,
  WEB_PIN_FRAME_TIMEOUT_MS,
} from "../lib/webFrame";

type FrameState = "loading" | "loaded" | "blocked";

/**
 * Web/PWA "Open with Buzz" pinned site: sandboxed iframe with a small toolbar, or a calm fallback card when framing
 * is blocked. Mounted by WebPinFrameHost and kept alive while hidden, so returning resumes without a reload.
 * Browsers fire `load` even for X-Frame-Options/frame-ancestors-blocked frames and hide that cross-origin, so
 * detection is: known-hostile hosts + a no-load timeout, plus a slim post-load hint in case the page stayed blank.
 */
export function WebPinnedSiteFrame({ pin }: { pin: PinnedSite }) {
  const url = pin.url;
  const preBlocked = !isFrameableScheme(url) || isKnownFrameBlockedUrl(url);
  const [state, setState] = React.useState<FrameState>(preBlocked ? "blocked" : "loading");
  const [hintOpen, setHintOpen] = React.useState(true);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (nonce < 0) return; // nonce: Reload restarts the timeout
    if (preBlocked) {
      setState("blocked");
      return;
    }
    setState("loading");
    setHintOpen(true);
    const t = window.setTimeout(
      () => setState((s) => (s === "loading" ? "blocked" : s)),
      WEB_PIN_FRAME_TIMEOUT_MS,
    );
    return () => window.clearTimeout(t);
  }, [preBlocked, nonce]);

  const open = () => openExternalUrl(url);
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep raw */
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background" data-testid="web-pinned-site">
      <div
        className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-1.5"
        data-testid="web-pinned-site-toolbar"
      >
        <Globe aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">{pin.name}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{host}</p>
        </div>
        <button
          aria-label="Reload"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          disabled={preBlocked}
          onClick={() => setNonce((n) => n + 1)}
          title="Reload"
          type="button"
        >
          <RotateCw className="h-4 w-4" />
        </button>
        <button
          aria-label="Open in browser"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={open}
          title="Open in browser"
          type="button"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>
      {state === "loaded" && hintOpen ? (
        <div
          className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground"
          data-testid="web-pinned-site-hint"
        >
          <span className="min-w-0 flex-1 truncate">Blank page? This site may block being shown inside apps.</span>
          <button className="shrink-0 font-medium text-foreground hover:underline" onClick={open} type="button">
            Open in browser
          </button>
          <button
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-0.5 hover:bg-accent"
            onClick={() => setHintOpen(false)}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 bg-background">
        {state === "blocked" ? (
          <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
            <div
              className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-5 text-center text-card-foreground shadow-sm"
              data-testid="web-pinned-site-fallback"
              role="note"
            >
              <Globe aria-hidden className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">{pin.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {host} doesn't allow itself to be shown inside another app.
              </p>
              <button
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                onClick={open}
                type="button"
              >
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                Open in browser
              </button>
            </div>
          </div>
        ) : (
          <>
            <iframe
              allow="clipboard-read; clipboard-write; fullscreen"
              className="absolute inset-0 h-full w-full border-0 bg-white"
              data-testid="web-pinned-site-iframe"
              key={`${pin.id}:${nonce}`}
              onError={() => setState("blocked")}
              onLoad={() => setState("loaded")}
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox={WEB_PIN_FRAME_SANDBOX}
              src={url}
              title={pin.name}
            />
            {state === "loading" ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 animate-pulse bg-primary/60" />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
