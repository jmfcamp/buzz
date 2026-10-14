import * as React from "react";
import { ExternalLink, Globe, RotateCw, X } from "lucide-react";

import { openExternalUrl } from "@/shared/lib/externalLinks";

import { usePinnedSites } from "../hooks";
import {
  isFrameableScheme,
  isKnownFrameBlockedUrl,
  isOpenOutsideUrl,
  setOpenOutsideUrl,
  WEB_PIN_FRAME_SANDBOX,
  WEB_PIN_FRAME_TIMEOUT_MS,
} from "../lib/webFrame";

type FrameState = "loading" | "loaded" | "blocked";

/**
 * Web/PWA pinned site: sandboxed iframe panel with a small toolbar, or a calm fallback card when framing is blocked.
 * Browsers fire `load` even for X-Frame-Options/frame-ancestors-blocked frames and hide the result cross-origin,
 * so detection is: known-hostile hosts + hosts the user marked "always open outside" + a no-load timeout.
 * After load a slim hint offers the way out in case the page stayed blank.
 */
export function WebPinnedSiteFrame({ pinId }: { pinId: string }) {
  const { pins, isLoading } = usePinnedSites();
  const pin = pins.find((p) => p.id === pinId);
  const url = pin?.url ?? "";
  const [outsideTick, setOutsideTick] = React.useState(0);
  const preBlocked = React.useMemo(
    () =>
      !!url &&
      outsideTick >= 0 &&
      (!isFrameableScheme(url) ||
        isKnownFrameBlockedUrl(url) ||
        isOpenOutsideUrl(url)),
    [url, outsideTick],
  );
  const [state, setState] = React.useState<FrameState>("loading");
  const [hintOpen, setHintOpen] = React.useState(true);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (!url || nonce < 0) return; // nonce: Reload restarts the timeout
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
  }, [url, preBlocked, nonce]);

  if (!pin) {
    return (
      <FallbackCard
        body={
          isLoading
            ? "Loading your pinned sites…"
            : "This pinned site isn't in your list any more."
        }
        title={isLoading ? "One moment" : "Pinned site not found"}
      />
    );
  }

  const open = () => openExternalUrl(pin.url);
  let host = pin.url;
  try {
    host = new URL(pin.url).host;
  } catch {
    /* keep raw */
  }
  const markOutside = (on: boolean) => {
    setOpenOutsideUrl(pin.url, on);
    setOutsideTick((n) => n + 1);
    if (on) open();
  };
  const rememberedOutside = isOpenOutsideUrl(pin.url);

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      data-testid="web-pinned-site"
    >
      <div
        className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-1.5"
        data-testid="web-pinned-site-toolbar"
      >
        <Globe aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight">
            {pin.name}
          </p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {host}
          </p>
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
          aria-label="Open in new tab"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={open}
          title="Open in new tab"
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
          <span className="min-w-0 flex-1 truncate">
            Blank page? This site may block being shown inside apps.
          </span>
          <button
            className="shrink-0 font-medium text-foreground hover:underline"
            onClick={() => markOutside(true)}
            type="button"
          >
            Always open in new tab
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
          <FallbackCard
            action={{ label: "Open in new tab", onClick: open }}
            body={
              rememberedOutside
                ? `You chose to open ${host} on its own.`
                : `${host} doesn't allow itself to be shown inside another app, so it opens on its own.`
            }
            secondary={
              rememberedOutside
                ? {
                    label: "Try inside the app again",
                    onClick: () => markOutside(false),
                  }
                : undefined
            }
            title={pin.name}
          />
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
              src={pin.url}
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

type Action = { label: string; onClick: () => void };

function FallbackCard({
  title,
  body,
  action,
  secondary,
}: {
  title: string;
  body: string;
  action?: Action;
  secondary?: Action;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
      <div
        className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-5 text-center text-card-foreground shadow-sm"
        data-testid="web-pinned-site-fallback"
        role="note"
      >
        <Globe
          aria-hidden
          className="mx-auto mb-3 h-6 w-6 text-muted-foreground"
        />
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{body}</p>
        {action ? (
          <button
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            onClick={action.onClick}
            type="button"
          >
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            {action.label}
          </button>
        ) : null}
        {secondary ? (
          <button
            className="mt-2 block w-full text-[11px] text-muted-foreground hover:underline"
            onClick={secondary.onClick}
            type="button"
          >
            {secondary.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
