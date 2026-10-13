import * as React from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";

import { isStaleChunkError, reloadForStaleBuild } from "@/shared/lib/lazyWithReload";
import { Button } from "@/shared/ui/button";

/**
 * Router error page: calm and themed, never the default red box. A screen whose code chunk belongs to an older deploy
 * ("Importing a module script failed") reloads once onto the new build (sessionStorage-guarded so it can't loop); if it
 * still fails, the card offers Reload.
 */
export function AppRouteError({ error, reset }: ErrorComponentProps) {
  const stale = isStaleChunkError(error);
  const [reloading] = React.useState(() => stale && reloadForStaleBuild());
  if (reloading) return null; // the page is reloading onto the new build
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6" data-testid="app-route-error">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-xs">
        <p className="text-sm font-semibold">{stale ? "A new version is ready" : "This screen couldn't load"}</p>
        <p className="text-sm text-muted-foreground">
          {stale
            ? "HulaBuzz was updated while it was open. Reload to pick up the new version."
            : "Something went wrong showing this screen. Reloading usually fixes it."}
        </p>
        <div className="flex gap-2">
          <Button data-testid="app-route-error-reload" onClick={() => location.reload()} size="sm" type="button">
            Reload
          </Button>
          {stale ? null : (
            <Button onClick={reset} size="sm" type="button" variant="ghost">
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
