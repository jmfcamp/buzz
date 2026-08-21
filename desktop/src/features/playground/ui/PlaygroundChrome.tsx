import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Inspect,
  RefreshCw,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

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

export function PlaygroundChrome({
  conversation,
  session,
}: {
  conversation: PlaygroundConversation | null;
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
      className="flex shrink-0 flex-col gap-2 border-b border-border px-3 py-2"
      data-testid="playground-chrome"
    >
      <div className="flex min-w-0 items-center gap-2">
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
            className="max-w-[55%] truncate bg-muted px-2 py-1 text-2xs text-muted-foreground"
            data-testid="playground-url-prefix"
          >
            {locked.prefix}
          </span>
          <input
            aria-label="Playground path"
            className="min-w-0 flex-1 bg-transparent px-2 py-1 text-2xs text-foreground outline-none"
            data-testid="playground-url-suffix"
            onChange={(event) => setSuffix(event.target.value)}
            value={suffix}
          />
        </form>
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
        {canScreenshot ? (
          <Button
            data-testid="playground-screenshot"
            onClick={handleScreenshot}
            size="xs"
            type="button"
            variant="outline"
          >
            <Camera />
            Screenshot
          </Button>
        ) : null}
        <Button
          data-testid="playground-dismiss"
          onClick={() => dismissPlayground()}
          size="xs"
          type="button"
          variant="ghost"
        >
          Dismiss
        </Button>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
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
        <div className="flex items-center gap-1">
          {disposeArmed ? (
            <>
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
            </>
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
        </div>
      </div>
    </header>
  );
}
