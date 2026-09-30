import * as React from "react";
import { ChevronDown, Clock3, Coins, Brain } from "lucide-react";

import { Markdown } from "@/shared/ui/markdown";
import { cn } from "@/shared/lib/cn";
import {
  useAgentMessageTurnMeta,
  type AgentMessageTurnMeta,
} from "@/features/messages/useAgentMessageTurnMeta";
import type { TimelineMessage } from "@/features/messages/types";

type ChromeContextValue = {
  meta: AgentMessageTurnMeta;
  expanded: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  showThoughtChip: boolean;
  messageId: string;
};

const AgentMessageTurnChromeContext =
  React.createContext<ChromeContextValue | null>(null);

function useChromeContext(): ChromeContextValue | null {
  return React.useContext(AgentMessageTurnChromeContext);
}

type RootProps = {
  channelId: string | null | undefined;
  message: TimelineMessage;
  children: React.ReactNode;
};

/**
 * Owns turn meta + expand state for header chips and the above-body card.
 * Mount around the message column so both slots share one join.
 */
export function AgentMessageTurnChromeRoot({
  channelId,
  message,
  children,
}: RootProps) {
  const [expanded, setExpanded] = React.useState(false);
  const meta = useAgentMessageTurnMeta({
    agentPubkey: message.pubkey,
    channelId,
    messageId: message.id,
    createdAt: message.createdAt,
    parentId: message.parentId,
    isAgent: message.isAgent === true,
  });

  const showThoughtChip = meta.enabled && meta.hasThinkingContent;
  React.useEffect(() => {
    if (!showThoughtChip && expanded) setExpanded(false);
  }, [showThoughtChip, expanded]);

  const value = React.useMemo(
    () => ({
      meta,
      expanded,
      setExpanded,
      showThoughtChip,
      messageId: message.id,
    }),
    [meta, expanded, showThoughtChip, message.id],
  );

  return (
    <AgentMessageTurnChromeContext.Provider value={value}>
      {children}
    </AgentMessageTurnChromeContext.Provider>
  );
}

/** Duration / Thought / tokens chips for the message header meta row. */
export function AgentMessageTurnHeaderChips() {
  const ctx = useChromeContext();
  if (!ctx || !ctx.meta.enabled) return null;

  const { meta, expanded, setExpanded, showThoughtChip, messageId } = ctx;

  if (!meta.durationLabel && !meta.tokensLabel && !showThoughtChip) {
    if (meta.durationLoading || meta.metricLoading || meta.thinkingLoading) {
      return (
        <span
          className="text-2xs text-muted-foreground/60"
          data-testid={`agent-message-turn-chrome-${messageId}`}
        >
          …
        </span>
      );
    }
    return null;
  }

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1"
      data-testid={`agent-message-turn-chrome-${messageId}`}
    >
      {meta.durationLabel ? (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-2xs tabular-nums text-muted-foreground"
          data-testid={`agent-message-duration-${messageId}`}
          title="Time from prompt to this reply"
        >
          <Clock3 className="h-3 w-3" />
          {meta.durationLabel}
        </span>
      ) : meta.durationLoading ? (
        <span className="px-1 text-2xs text-muted-foreground/60">…</span>
      ) : null}

      {showThoughtChip ? (
        <button
          aria-expanded={expanded}
          aria-label="Thought"
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full border border-border/70 bg-muted/40 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground",
            expanded && "bg-muted/70 text-foreground",
          )}
          data-testid={`agent-message-thinking-toggle-${messageId}`}
          onClick={() => setExpanded((v) => !v)}
          title="Thought"
          type="button"
        >
          <Brain className="h-3 w-3" />
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>
      ) : null}

      {meta.tokensLabel ? (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-2xs tabular-nums text-muted-foreground"
          data-testid={`agent-message-tokens-${messageId}`}
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
    </span>
  );
}

/** Thinking expand card — mount between header and message body. */
export function AgentMessageTurnThinkingCard() {
  const ctx = useChromeContext();
  if (!ctx || !ctx.expanded || !ctx.showThoughtChip) return null;

  const { meta, messageId } = ctx;

  return (
    <div
      className="mb-1.5 max-h-64 overflow-y-auto rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2"
      data-testid={`agent-message-thinking-card-${messageId}`}
    >
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
          return null;
        })}
      </ul>
    </div>
  );
}
