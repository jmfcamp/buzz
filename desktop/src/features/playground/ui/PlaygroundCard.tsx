import { isTauri } from "@tauri-apps/api/core";
import { AppWindow, ExternalLink } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/shared/ui/attachment";

import { probePlaygroundUrl } from "../lib/probe";
import { addPlaygroundSession } from "../lib/sessions";
import type { PlaygroundCard as PlaygroundCardData } from "../lib/types";

function canHostPlayground(): boolean {
  return (
    isTauri() ||
    import.meta.env.MODE === "e2e" ||
    import.meta.env.MODE === "test"
  );
}

async function openPlaygroundInBrowser(url: string) {
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

  async function handleAdd() {
    if (busy) return;
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

  return (
    <Attachment
      className="my-2 max-w-md"
      data-testid="playground-card"
      orientation="vertical"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AttachmentMedia>
          <AppWindow />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle data-testid="playground-card-name">
            {card.name}
          </AttachmentTitle>
          <AttachmentDescription data-testid="playground-card-url">
            {card.url}
          </AttachmentDescription>
          <p className="mt-1 text-xs text-muted-foreground">
            PIN{" "}
            <span
              className="font-mono text-foreground"
              data-testid="playground-card-pin"
            >
              {card.pin}
            </span>
            {card.stack ? (
              <>
                {" "}
                · <span data-testid="playground-card-stack">{card.stack}</span>
              </>
            ) : null}
          </p>
        </AttachmentContent>
      </div>
      <AttachmentActions>
        {host ? (
          <Button
            data-testid="playground-card-add"
            disabled={busy}
            onClick={() => void handleAdd()}
            size="sm"
            type="button"
          >
            Add
          </Button>
        ) : (
          <Button
            data-testid="playground-card-open"
            onClick={() => void openPlaygroundInBrowser(card.url)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <ExternalLink />
            Open in browser
          </Button>
        )}
      </AttachmentActions>
    </Attachment>
  );
}
