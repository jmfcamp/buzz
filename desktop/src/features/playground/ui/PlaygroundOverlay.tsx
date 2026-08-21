import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/shared/lib/cn";

import type { PlaygroundConversation } from "../lib/conversation";
import {
  PLAYGROUND_FULLSCREEN_OVERLAY_CLASS,
  PLAYGROUND_FULLSCREEN_TITLEBAR_GAP_TEST_ID,
  PLAYGROUND_OPAQUE_FILL_STYLE,
  PLAYGROUND_OVERLAY_SURFACE_CLASS,
  PLAYGROUND_WINDOWED_OVERLAY_CLASS,
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

  const overlay = (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col isolate overflow-hidden",
        PLAYGROUND_OVERLAY_SURFACE_CLASS,
        fullscreen
          ? PLAYGROUND_FULLSCREEN_OVERLAY_CLASS
          : PLAYGROUND_WINDOWED_OVERLAY_CLASS,
      )}
      data-fullscreen={fullscreen ? "true" : undefined}
      data-testid="playground-overlay"
      style={PLAYGROUND_OPAQUE_FILL_STYLE}
    >
      {fullscreen ? (
        <div
          aria-hidden
          className={cn("shrink-0", playgroundFullscreenTitlebarGapClass)}
          data-tauri-drag-region
          data-testid={PLAYGROUND_FULLSCREEN_TITLEBAR_GAP_TEST_ID}
          style={PLAYGROUND_OPAQUE_FILL_STYLE}
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

  // SidebarInset is `isolate z-0 overflow-hidden` under AppTopChrome `z-45`.
  // A local `fixed inset-0 z-50` cannot paint over that frosted strip (or
  // receive its clicks). Portal to body so fullscreen chrome is the only
  // hit target below the traffic lights.
  if (fullscreen && typeof document !== "undefined") {
    return createPortal(overlay, document.body);
  }
  return overlay;
}
