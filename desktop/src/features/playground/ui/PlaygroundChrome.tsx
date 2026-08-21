import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronLeft,
  Copy,
  Inspect,
  Maximize2,
  Minimize2,
  RefreshCw,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { copyTextToClipboard } from "@/shared/lib/clipboard";
import { Button } from "@/shared/ui/button";

import {
  playgroundAddressNavigation,
  splitLockedPlaygroundUrl,
  suffixFromCurrentUrl,
} from "../lib/addressBar";
import type { PlaygroundConversation } from "../lib/conversation";
import { playgroundScreenshotAvailable } from "../lib/conversation";
import {
  dismissAndStagePlaygroundScreenshot,
  playgroundScreenshotFile,
} from "../lib/screenshot";
import { dismissPlayground, disposePlayground } from "../lib/sessions";
import type { PlaygroundSession } from "../lib/sessions";
import { playgroundPin } from "../lib/types";
import type { PlaygroundNavState } from "../lib/types";
import {
  getPlaygroundWebviewNavState,
  inspectPlaygroundWebview,
  playgroundWebviewGoBack,
  playgroundWebviewGoForward,
  playgroundWebviewNavigate,
  playgroundWebviewReload,
  screenshotPlaygroundWebview,
  subscribePlaygroundWebviewNav,
} from "../lib/webview";
import type { PlaygroundChromeMode } from "./PlaygroundStage";

export function PlaygroundChrome({
  conversation,
  fullscreen,
  mode,
  onModeChange,
  onToggleFullscreen,
  session,
}: {
  conversation: PlaygroundConversation | null;
  fullscreen: boolean;
  mode: PlaygroundChromeMode;
  onModeChange: (mode: PlaygroundChromeMode) => void;
  onToggleFullscreen: () => void;
  session: PlaygroundSession;
}) {
  const locked = splitLockedPlaygroundUrl(session.url);
  const [nav, setNav] = React.useState<PlaygroundNavState>({
    sid: session.sid,
    canGoBack: false,
    canGoForward: false,
    currentUrl: session.url,
  });
  const [suffix, setSuffix] = React.useState(locked.suffix);
  const [disposeArmed, setDisposeArmed] = React.useState(false);
  const canScreenshot = playgroundScreenshotAvailable(conversation);
  const pin = playgroundPin(session);
  const currentUrl = nav.currentUrl || session.url;

  React.useEffect(() => {
    let cancelled = false;
    void getPlaygroundWebviewNavState(session.sid, session.url).then(
      (state) => {
        if (cancelled) return;
        setNav(state);
        setSuffix(
          suffixFromCurrentUrl(session.url, state.currentUrl || session.url),
        );
      },
    );
    const unlisten = subscribePlaygroundWebviewNav((payload) => {
      if (payload.sid !== session.sid) return;
      setNav(payload);
      setSuffix(suffixFromCurrentUrl(session.url, payload.currentUrl));
    });
    return () => {
      cancelled = true;
      void unlisten.then((stop) => stop());
    };
  }, [session.sid, session.url]);

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

  function handleAddressSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next = playgroundAddressNavigation(session.url, suffix);
    if (!next.ok) {
      toast.error(next.message);
      return;
    }
    void playgroundWebviewNavigate(session.sid, next.url).then(setNav);
  }

  async function handleScreenshot() {
    if (!conversation) return;
    try {
      const result = await screenshotPlaygroundWebview(session.sid);
      const file = playgroundScreenshotFile(result);
      dismissAndStagePlaygroundScreenshot({ conversation, file });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not capture playground.",
      );
    }
  }

  return (
    <header
      className="flex shrink-0 flex-col gap-1 border-b border-border px-2 py-1"
      data-testid="playground-chrome"
    >
      <div className="flex min-w-0 items-center gap-1">
        {disposeArmed ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              onClick={() => setDisposeArmed(false)}
              size="xs"
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              data-testid="playground-dispose-confirm"
              onClick={() => disposePlayground(session.sid)}
              size="xs"
              type="button"
              variant="destructive"
            >
              Confirm dispose
            </Button>
          </div>
        ) : (
          <Button
            data-testid="playground-dispose"
            onClick={() => setDisposeArmed(true)}
            size="xs"
            type="button"
            variant="destructive"
          >
            Dispose
          </Button>
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            aria-label="Back"
            data-testid="playground-back"
            disabled={!nav.canGoBack}
            onClick={() => {
              void playgroundWebviewGoBack(session.sid).then(setNav);
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ArrowLeft />
          </Button>
          <Button
            aria-label="Forward"
            data-testid="playground-forward"
            disabled={!nav.canGoForward}
            onClick={() => {
              void playgroundWebviewGoForward(session.sid).then(setNav);
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ArrowRight />
          </Button>
          <Button
            aria-label="Refresh"
            data-testid="playground-refresh"
            onClick={() => {
              void playgroundWebviewReload(session.sid);
            }}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <RefreshCw />
          </Button>
        </div>
        <form
          className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-border bg-muted/40"
          data-testid="playground-address"
          onSubmit={handleAddressSubmit}
        >
          <span
            className="max-w-[55%] truncate bg-muted px-2 py-0.5 text-2xs text-muted-foreground"
            data-testid="playground-url-prefix"
          >
            {locked.prefix}
          </span>
          <input
            aria-label="Playground path"
            className="min-w-0 flex-1 bg-transparent px-2 py-0.5 text-2xs text-foreground outline-none"
            data-testid="playground-url-suffix"
            onChange={(event) => setSuffix(event.target.value)}
            value={suffix}
          />
        </form>
        <Button
          aria-label="Copy full URL"
          data-testid="playground-copy-url"
          onClick={() => copyTextToClipboard(currentUrl, "URL copied")}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Copy />
        </Button>
        <Button
          aria-label="Inspect"
          data-testid="playground-inspect"
          onClick={() => void handleInspect()}
          size="icon-xs"
          type="button"
          variant="outline"
        >
          <Inspect />
        </Button>
        {canScreenshot ? (
          <Button
            aria-label="Screenshot"
            data-testid="playground-screenshot"
            onClick={handleScreenshot}
            size="icon-xs"
            type="button"
            variant="outline"
          >
            <Camera />
          </Button>
        ) : null}
        <Button
          aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          data-testid="playground-fullscreen"
          onClick={onToggleFullscreen}
          size="icon-xs"
          type="button"
          variant="outline"
        >
          {fullscreen ? <Minimize2 /> : <Maximize2 />}
        </Button>
        <Button
          aria-label="Dismiss"
          data-testid="playground-dismiss"
          onClick={() => dismissPlayground()}
          size="icon-xs"
          type="button"
          variant="outline"
        >
          <ChevronLeft />
        </Button>
      </div>
      <div
        className="relative flex min-w-0 items-center justify-start gap-1 py-0.5"
        data-testid="playground-mode-row"
      >
        <ModeButton
          active={mode === "desktop"}
          label="Desktop"
          onSelect={() => onModeChange("desktop")}
          testId="playground-mode-desktop"
        />
        <ModeButton
          active={mode === "responsive"}
          label="Responsive"
          onSelect={() => onModeChange("responsive")}
          testId="playground-mode-responsive"
        />
        <ModeButton
          active={mode === "mobile"}
          label="Mobile"
          onSelect={() => onModeChange("mobile")}
          testId="playground-mode-mobile"
        />
        {pin ? (
          <p
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-mono text-2xs text-muted-foreground"
            data-testid="playground-chrome-pin"
          >
            PIN {pin}
          </p>
        ) : null}
      </div>
    </header>
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
