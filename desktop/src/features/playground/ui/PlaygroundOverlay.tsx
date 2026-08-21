import * as React from "react";

import { cn } from "@/shared/lib/cn";

import type { PlaygroundConversation } from "../lib/conversation";
import {
  PLAYGROUND_FULLSCREEN_TITLEBAR_GAP_TEST_ID,
  PLAYGROUND_OVERLAY_SURFACE_CLASS,
  playgroundFullscreenTitlebarGapClass,
  playgroundStageLayoutKey,
} from "../lib/overlayLayout";
import type { PlaygroundSession } from "../lib/sessions";
import { PlaygroundChrome } from "./PlaygroundChrome";
import { PlaygroundStage, type PlaygroundChromeMode } from "./PlaygroundStage";

export function PlaygroundOverlay({
  conversation = null,
  session,
}: {
  conversation?: PlaygroundConversation | null;
  session: PlaygroundSession;
}) {
  const [mode, setMode] = React.useState<PlaygroundChromeMode>("desktop");
  const [fullscreen, setFullscreen] = React.useState(false);
  const [layoutEpoch, setLayoutEpoch] = React.useState(0);

  const bumpStageLayout = React.useCallback(() => {
    setLayoutEpoch((value) => value + 1);
  }, []);

  const setOverlayFullscreen = React.useCallback((next: boolean) => {
    setFullscreen(next);
    setLayoutEpoch((value) => value + 1);
  }, []);

  React.useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOverlayFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, setOverlayFullscreen]);

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col isolate overflow-hidden",
        PLAYGROUND_OVERLAY_SURFACE_CLASS,
        fullscreen ? "fixed inset-0 z-50" : "absolute inset-0 z-30",
      )}
      data-fullscreen={fullscreen ? "true" : undefined}
      data-testid="playground-overlay"
    >
      {fullscreen ? (
        <div
          aria-hidden
          className={cn("shrink-0", playgroundFullscreenTitlebarGapClass)}
          data-tauri-drag-region
          data-testid={PLAYGROUND_FULLSCREEN_TITLEBAR_GAP_TEST_ID}
        />
      ) : null}
      <PlaygroundChrome
        conversation={conversation}
        fullscreen={fullscreen}
        mode={mode}
        onModeChange={setMode}
        onStageResync={bumpStageLayout}
        onToggleFullscreen={() => setOverlayFullscreen(!fullscreen)}
        session={session}
      />
      <PlaygroundStage
        layoutKey={playgroundStageLayoutKey(fullscreen, layoutEpoch)}
        mode={mode}
        session={session}
      />
    </div>
  );
}
