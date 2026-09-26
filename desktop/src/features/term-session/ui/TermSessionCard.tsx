import { SquareTerminal } from "lucide-react";
import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { toast } from "sonner";

import { deriveShellRoute } from "@/app/AppShell.helpers";
import { useChannelsQuery } from "@/features/channels/hooks";
import { Button } from "@/shared/ui/button";
import {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from "@/shared/ui/attachment";

import { openTermSessionCard } from "../lib/openCard.ts";
import type { TermSessionCard as TermSessionCardData } from "../lib/types.ts";

function conversationFromLocation(
  pathname: string,
  search: unknown,
  channels: { id: string; name: string }[] | undefined,
) {
  const route = deriveShellRoute(pathname);
  const params = search as { thread?: unknown; threadRootId?: unknown };
  const thread = params.threadRootId ?? params.thread;
  const channelId = route.selectedChannelId;
  if (!channelId) return null;
  const activeChannel = channels?.find((candidate) => candidate.id === channelId);
  return {
    channelId,
    // Display name for herdr workspace labels — never the raw channel id.
    channelName: activeChannel?.name ?? "channel",
    threadId: typeof thread === "string" && thread.length > 0 ? thread : null,
  };
}

export function TermSessionCard({ card }: { card: TermSessionCardData }) {
  const [busy, setBusy] = React.useState(false);
  const location = useLocation();
  const channelsQuery = useChannelsQuery();
  const conversation = React.useMemo(
    () =>
      conversationFromLocation(
        location.pathname,
        location.search,
        channelsQuery.data,
      ),
    [channelsQuery.data, location.pathname, location.search],
  );

  function handleOpen() {
    if (!conversation) {
      toast.error("Open a channel or thread to launch Buzz Term.");
      return;
    }
    setBusy(true);
    void openTermSessionCard(card, conversation).finally(() => setBusy(false));
  }

  return (
    <Attachment
      className="my-2 max-w-md items-start overflow-visible"
      data-testid="term-session-card"
    >
      <AttachmentMedia>
        <SquareTerminal />
      </AttachmentMedia>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <AttachmentContent>
          <AttachmentTitle data-testid="term-session-card-name">
            {card.name}
          </AttachmentTitle>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-2xs text-secondary-foreground"
              data-testid="term-session-card-tool"
            >
              {card.tool}
            </span>
            {card.summary ? (
              <span data-testid="term-session-card-summary">{card.summary}</span>
            ) : null}
            {card.cwd ? (
              <span
                className="truncate font-mono"
                data-testid="term-session-card-cwd"
                title={card.cwd}
              >
                {card.cwd}
              </span>
            ) : null}
            {card.openclawWorkspace ? (
              <span data-testid="term-session-card-openclaw">OpenClaw</span>
            ) : null}
          </p>
        </AttachmentContent>
        <AttachmentActions className="relative z-20 w-full flex-wrap justify-end">
          <Button
            data-testid="term-session-card-open"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              handleOpen();
            }}
            size="sm"
            type="button"
          >
            Open
          </Button>
        </AttachmentActions>
      </div>
    </Attachment>
  );
}
