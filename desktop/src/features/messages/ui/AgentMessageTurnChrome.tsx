import * as React from "react";
import { ChevronDown, Clock3, Coins, Brain } from "lucide-react";

import { Markdown } from "@/shared/ui/markdown";
import { cn } from "@/shared/lib/cn";
import { useAgentMessageTurnMeta } from "@/features/messages/useAgentMessageTurnMeta";
import type { TimelineMessage } from "@/features/messages/types";

type AgentMessageTurnChromeProps = {
  channelId: string | null | undefined;
  message: TimelineMessage;
};

/**
 * LM Studio-style chrome under an agent/bot reply: duration, tokens, and a
 * thinking toggle that expands thought / tool-call cards for that turn.
 */
export function AgentMessageTurnChrome({
  channelId,
  message,
}: AgentMessageTurnChromeProps) {
  const [expanded, setExpanded] = React.useState(false);
  const meta = useAgentMessageTurnMeta({
    agentPubkey: message.pubkey,
    channelId,
    messageId: message.id,
    createdAt: message.createdAt,
    parentId: message.parentId,
    isAgent: message.isAgent === true,
    thinkingExpanded: expanded,
  });

  if (!meta.enabled) return null;

  const hasThinking =
    meta.thoughtCount > 0 || meta.toolCount > 0 || meta.turnItems.length > 0;
  const thinkingLabel = hasThinking
    ? meta.durationLabel
      ? `Thought for ${meta.durationLabel}`
      : "Thinking"
    : meta.durationLabel
      ? `Ran for ${meta.durationLabel}`
      : "Thinking";

  return (
    <div
      className="mt-1.5 space-y-1.5"
      data-testid={`agent-message-turn-chrome-${message.id}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          aria-expanded={expanded}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground",
            expanded && "bg-muted/70 text-foreground",
          )}
          data-testid={`agent-message-thinking-toggle-${message.id}`}
          onClick={() => setExpanded((v) => !v)}
          type="button"
        >
          <Brain className="h-3 w-3" />
          <span>{thinkingLabel}</span>
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>

        {meta.durationLabel ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-2xs tabular-nums text-muted-foreground"
            data-testid={`agent-message-duration-${message.id}`}
            title="Time from prompt to this reply"
          >
            <Clock3 className="h-3 w-3" />
            {meta.durationLabel}
          </span>
        ) : meta.durationLoading ? (
          <span className="px-1 text-2xs text-muted-foreground/60">…</span>
        ) : null}

        {meta.tokensLabel ? (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-2xs tabular-nums text-muted-foreground"
            data-testid={`agent-message-tokens-${message.id}`}
            title={
              meta.metric
                ? [
                    meta.metric.turnInputTokens
                      ? `in ${meta.metric.turnInputTokens}`
                      : null,
                    meta.metric.turnOutputTokens
                      ? `out ${meta.metric.turnOutputTokens}`
                      : null,
                    meta.metric.model ? meta.metric.model : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Tokens for this turn"
            }
          >
            <Coins className="h-3 w-3" />
            {meta.tokensLabel} tok
          </span>
        ) : meta.metricLoading ? (
          <span className="px-1 text-2xs text-muted-foreground/60">…</span>
        ) : null}
      </div>

      {expanded ? (
        <div
          className="max-h-64 overflow-y-auto rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2"
          data-testid={`agent-message-thinking-card-${message.id}`}
        >
          {meta.turnItems.length === 0 ? (
            <p className="text-2xs text-muted-foreground">
              No thinking or tool activity found for this reply yet. Open Usage
              &amp; activity on the agent for full history.
            </p>
          ) : (
            <ul className="space-y-2">
              {meta.turnItems.map((item) => {
                if (item.type === "thought") {
                  return (
                    <li
                      className="text-xs leading-5 text-muted-foreground"
                      key={item.id}
                    >
                      <p className="mb-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground/80">
                        {item.title || "Thinking"}
                      </p>
                      <Markdown
                        className="leading-5"
                        content={item.text.trim() || " "}
                      />
                    </li>
                  );
                }
                if (item.type === "tool") {
                  return (
                    <li
                      className="flex items-start gap-1.5 text-xs text-muted-foreground"
                      key={item.id}
                    >
                      <span className="mt-0.5 shrink-0 rounded bg-muted px-1 py-0.5 text-2xs font-medium text-foreground/80">
                        tool
                      </span>
                      <span className="min-w-0 break-words">
                        {item.title}
                        {item.status ? (
                          <span className="text-muted-foreground/70">
                            {" "}
                            · {item.status}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                }
                if (item.type === "lifecycle" && item.renderClass === "error") {
                  return (
                    <li className="text-xs text-destructive" key={item.id}>
                      {item.title}: {item.text}
                    </li>
                  );
                }
                return null;
              })}
            </ul>
          )}
          {meta.joinMethod === "time-proximity" ? (
            <p className="mt-2 text-3xs text-muted-foreground/70">
              Linked by time (no prompt event id on the turn).
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
