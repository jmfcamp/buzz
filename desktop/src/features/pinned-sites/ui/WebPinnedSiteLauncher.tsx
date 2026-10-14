import { ExternalLink } from "lucide-react";

import { usePinnedSite } from "../hooks";
import { openWebPinExternally } from "../lib/webPinOpen";

/** Web /pins/<id> reached by URL (no click to open from): one tap opens the site in the default browser. */
export function WebPinnedSiteLauncher({ pinId }: { pinId: string }) {
  const pin = usePinnedSite(pinId);
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
      <div
        className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-5 text-center text-card-foreground shadow-sm"
        data-testid="web-pinned-site-launcher"
        role="note"
      >
        <p className="text-sm font-medium">{pin?.name ?? "Pinned site"}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {pin ? "Pinned sites open in your browser." : "This pinned site isn't in your list any more."}
        </p>
        {pin ? (
          <button
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            onClick={() => openWebPinExternally(pin.id, pin.url)}
            type="button"
          >
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            Open {pin.name}
          </button>
        ) : null}
      </div>
    </div>
  );
}
