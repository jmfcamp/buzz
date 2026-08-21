import * as React from "react";

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

  return (
    <div
      className="absolute inset-0 z-30 flex min-h-0 min-w-0 flex-col bg-background/95"
      data-testid="playground-overlay"
    >
      <PlaygroundChrome conversation={conversation} session={session} />
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-1">
        <ModeButton
          active={mode === "desktop"}
          label="Desktop"
          onSelect={() => setMode("desktop")}
          testId="playground-mode-desktop"
        />
        <ModeButton
          active={mode === "responsive"}
          label="Responsive"
          onSelect={() => setMode("responsive")}
          testId="playground-mode-responsive"
        />
        <ModeButton
          active={mode === "mobile"}
          label="Mobile"
          onSelect={() => setMode("mobile")}
          testId="playground-mode-mobile"
        />
      </div>
      <PlaygroundStage mode={mode} session={session} />
    </div>
  );
}

function ModeButton({
  active,
  label,
  onSelect,
  testId,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <button
      className={
        active
          ? "rounded-md bg-secondary px-2 py-0.5 text-xs"
          : "rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
      }
      data-testid={testId}
      onClick={onSelect}
      type="button"
    >
      {label}
    </button>
  );
}
