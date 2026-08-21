import { isTauri } from "@tauri-apps/api/core";
import { AppWindow, Copy } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { copyTextToClipboard } from "@/shared/lib/clipboard";
import { Button } from "@/shared/ui/button";
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from "@/shared/ui/attachment";

import { probePlaygroundUrl } from "../lib/probe";
import {
  addPlaygroundSession,
  hasPlaygroundSession,
  notePlaygroundCard,
  showPlaygroundSession,
} from "../lib/sessions";
import type { PlaygroundCard as PlaygroundCardData } from "../lib/types";

function canHostPlayground(): boolean {
  return (
    isTauri() ||
    import.meta.env.MODE === "e2e" ||
    import.meta.env.MODE === "test"
  );
}

async function openPlaygroundInBrowser(url: string) {
  if (import.meta.env.MODE === "test") {
    const stub = (
      globalThis as { __BUZZ_PLAYGROUND_OPEN_URL__?: (nextUrl: string) => void }
    ).__BUZZ_PLAYGROUND_OPEN_URL__;
    if (stub) {
      stub(url);
      return;
    }
  }
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function PlaygroundCard({ card }: { card: PlaygroundCardData }) {
  const [busy, setBusy] = React.useState(false);
  const host = canHostPlayground();

  React.useEffect(() => {
    notePlaygroundCard(card);
  }, [card]);

  async function handleOpen() {
    if (busy) return;
    if (!host) {
      void openPlaygroundInBrowser(card.url);
      return;
    }
    if (hasPlaygroundSession(card.sid)) {
      showPlaygroundSession(card.sid);
      return;
    }
    setBusy(true);
    try {
      const result = await probePlaygroundUrl(card.url);
      if (!result.up) {
        toast.error(result.message ?? "Playground is down.");
        return;
      }
      addPlaygroundSession(card);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Playground is down.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleUrlClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    event.stopPropagation();
    void openPlaygroundInBrowser(card.url);
  }

  function handleCopyPin(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    copyTextToClipboard(card.pin, "PIN copied");
  }

  return (
    <Attachment className="my-2 max-w-md" data-testid="playground-card">
      <AttachmentMedia>
        <AppWindow />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle data-testid="playground-card-name">
          {card.name}
        </AttachmentTitle>
        <a
          className="block truncate text-xs leading-4 text-muted-foreground hover:text-foreground hover:underline"
          data-testid="playground-card-url"
          href={card.url}
          onClick={handleUrlClick}
          rel="noopener noreferrer"
        >
          {card.url}
        </a>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          PIN{" "}
          <span
            className="font-mono text-foreground"
            data-testid="playground-card-pin"
          >
            {card.pin}
          </span>
          <button
            aria-label="Copy PIN"
            className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            data-testid="playground-card-copy-pin"
            onClick={handleCopyPin}
            type="button"
          >
            <Copy className="h-3 w-3" />
          </button>
          {card.stack ? (
            <>
              {" "}
              · <span data-testid="playground-card-stack">{card.stack}</span>
            </>
          ) : null}
        </p>
      </AttachmentContent>
      <AttachmentActions>
        <Button
          data-testid="playground-card-open"
          disabled={busy}
          onClick={(event) => {
            event.stopPropagation();
            void handleOpen();
          }}
          size="sm"
          type="button"
        >
          Open
        </Button>
      </AttachmentActions>
    </Attachment>
  );
}
