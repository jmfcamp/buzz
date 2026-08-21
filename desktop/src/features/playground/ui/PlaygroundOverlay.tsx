import * as React from "react";

import { cn } from "@/shared/lib/cn";

import type { PlaygroundConversation } from "../lib/conversation";
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

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col bg-background",
        fullscreen
          ? "fixed inset-0 z-50"
          : "absolute inset-0 z-30 bg-background/95",
      )}
      data-fullscreen={fullscreen ? "true" : undefined}
      data-testid="playground-overlay"
    >
      <PlaygroundChrome
        conversation={conversation}
        fullscreen={fullscreen}
        mode={mode}
        onModeChange={setMode}
        onToggleFullscreen={() => setFullscreen((value) => !value)}
        session={session}
      />
      <PlaygroundStage mode={mode} session={session} />
    </div>
  );
}
