import { Inspect, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";

import { usePlaygroundSessions } from "../hooks";
import {
  dismissPlayground,
  disposePlayground,
  type PlaygroundSession,
} from "../lib/sessions";
import { inspectPlaygroundWebview } from "../lib/webview";
import { PlaygroundStage, type PlaygroundChromeMode } from "./PlaygroundStage";

export function PlaygroundHost() {
  const { sessions, overlaySid } = usePlaygroundSessions();
  const session = overlaySid ? (sessions.get(overlaySid) ?? null) : null;
  if (!session) return null;
  return <PlaygroundOverlay session={session} />;
}

export function PlaygroundOverlay({ session }: { session: PlaygroundSession }) {
  const [mode, setMode] = React.useState<PlaygroundChromeMode>("desktop");

  async function handleInspect() {
    try {
      await inspectPlaygroundWebview(session.sid);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not inspect playground.",
      );
    }
  }

  return (
    <div
      className="absolute inset-0 z-30 flex min-h-0 min-w-0 flex-col bg-background/95"
      data-testid="playground-overlay"
    >
      <header
        className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2"
        data-testid="playground-chrome"
      >
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium"
            data-testid="playground-chrome-name"
          >
            {session.name}
          </p>
          <p className="truncate text-2xs text-muted-foreground">
            PIN{" "}
            <span
              className="font-mono text-foreground"
              data-testid="playground-chrome-pin"
            >
              {session.pin}
            </span>
            {session.stack ? (
              <>
                {" "}
                ·{" "}
                <span data-testid="playground-chrome-stack">
                  {session.stack}
                </span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-border p-0.5">
          <Button
            data-testid="playground-mode-desktop"
            onClick={() => setMode("desktop")}
            size="xs"
            type="button"
            variant={mode === "desktop" ? "secondary" : "ghost"}
          >
            Desktop
          </Button>
          <Button
            data-testid="playground-mode-mobile"
            onClick={() => setMode("mobile")}
            size="xs"
            type="button"
            variant={mode === "mobile" ? "secondary" : "ghost"}
          >
            Mobile
          </Button>
        </div>
        <Button
          data-testid="playground-inspect"
          onClick={() => void handleInspect()}
          size="xs"
          type="button"
          variant="outline"
        >
          <Inspect />
          Inspect
        </Button>
        <Button
          data-testid="playground-dismiss"
          onClick={() => dismissPlayground()}
          size="xs"
          type="button"
          variant="ghost"
        >
          Dismiss
        </Button>
        <Button
          className={cn("text-destructive")}
          data-testid="playground-dispose"
          onClick={() => disposePlayground(session.sid)}
          size="xs"
          type="button"
          variant="ghost"
        >
          <X />
          Dispose
        </Button>
      </header>
      <PlaygroundStage mode={mode} session={session} />
    </div>
  );
}
