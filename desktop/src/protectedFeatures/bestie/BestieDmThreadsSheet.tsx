import { MessagesSquare, Trash2 } from "lucide-react";
import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { BESTIE_THREAD_SUMMARIZE_EVENT } from "./bestieThreadProtocol";
import { sortedBestieThreads } from "./bestieThreadStorage";
import {
  beginBestieThreadSummarizeForScope,
  removeBestieTrackedThreadForScope,
  useBestieThreads,
} from "./bestieThreadStore";
import type {
  BestieThreadScope,
  BestieTrackedThread,
} from "./bestieThreadTypes";

function ThreadRow({
  pending,
  scope,
  thread,
}: {
  pending: boolean;
  scope: BestieThreadScope;
  thread: BestieTrackedThread;
}) {
  const { goChannel } = useAppNavigation();
  const [expanded, setExpanded] = React.useState(false);
  const title =
    thread.channelName?.trim() ||
    `Thread ${thread.rootEventId.slice(0, 8)}…`;

  return (
    <div
      className="rounded-md border border-border/60 bg-muted/25 px-2 py-1.5"
      data-testid={`bestie-thread-item-${thread.id}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <button
            className="text-left"
            onClick={() =>
              void goChannel(thread.channelId, { thread: thread.rootEventId })
            }
            type="button"
          >
            <p className="text-sm font-medium leading-snug">{title}</p>
            <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">
              {thread.preview || "No preview"}
            </p>
          </button>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Added {new Date(thread.addedAt * 1000).toLocaleString()}
            {thread.lastSummaryAt
              ? ` · summarized ${new Date(thread.lastSummaryAt * 1000).toLocaleString()}`
              : ""}
          </p>
        </div>
        <Button
          className="h-7 shrink-0 px-2 text-xs"
          data-testid={`bestie-thread-summarize-${thread.id}`}
          disabled={pending}
          onClick={() => {
            const begun = beginBestieThreadSummarizeForScope(
              scope,
              thread.id,
            );
            if (!begun) return;
            window.dispatchEvent(
              new CustomEvent(BESTIE_THREAD_SUMMARIZE_EVENT, {
                detail: { threadId: thread.id },
              }),
            );
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          {pending ? "…" : "Summarize"}
        </Button>
        <Button
          aria-label="Stop tracking thread"
          className="size-6 shrink-0"
          data-testid={`bestie-thread-remove-${thread.id}`}
          onClick={() => removeBestieTrackedThreadForScope(scope, thread.id)}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {thread.lastSummary ? (
        <div className="mt-1.5 border-t border-border/40 pt-1.5">
          <button
            className={cn(
              "w-full text-left text-xs text-muted-foreground",
              !expanded && "line-clamp-2",
            )}
            data-testid={`bestie-thread-summary-${thread.id}`}
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            {thread.lastSummary}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function BestieDmThreadsSheet({ scope }: { scope: BestieThreadScope }) {
  const state = useBestieThreads(scope);
  const threads = sortedBestieThreads(state);
  const pendingId = state.pendingSummarize?.threadId ?? null;

  return (
    <div
      className="flex flex-col gap-3 py-1"
      data-testid="bestie-dm-threads-sheet"
    >
      <p className="px-0.5 text-xs text-muted-foreground">
        Threads where Bestie was asked to join (message action). Summarize
        posts a top-level Bestie DM turn.
      </p>
      <div className="space-y-1.5">
        {threads.length === 0 ? (
          <p className="px-0.5 text-xs text-muted-foreground">
            No tracked threads yet. Use Ask Assistant on a message to enroll one.
          </p>
        ) : (
          threads.map((thread) => (
            <ThreadRow
              key={thread.id}
              pending={pendingId === thread.id}
              scope={scope}
              thread={thread}
            />
          ))
        )}
      </div>
      {pendingId ? (
        <p
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          data-testid="bestie-thread-summarizing"
        >
          <MessagesSquare className="size-3.5" />
          Summarizing…
        </p>
      ) : null}
    </div>
  );
}
