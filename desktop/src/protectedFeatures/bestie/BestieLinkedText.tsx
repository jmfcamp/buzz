import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { parseMessageLink } from "@/features/messages/lib/messageLink";
import { cn } from "@/shared/lib/cn";

const MESSAGE_LINK_RE = /((?:buzz|hulabuzz):\/\/message\?[^\s)]+)/gi;

/**
 * Renders reminder, to-do, and scratch text with any buzz://message link as
 * a button that opens that message.
 */
export function BestieLinkedText({
  className,
  text,
}: {
  className?: string;
  text: string;
}) {
  const { goChannel } = useAppNavigation();
  const parts = React.useMemo(() => {
    const chunks: Array<{ kind: "link" | "text"; value: string }> = [];
    let last = 0;
    for (const match of text.matchAll(MESSAGE_LINK_RE)) {
      const index = match.index ?? 0;
      if (index > last) {
        chunks.push({ kind: "text", value: text.slice(last, index) });
      }
      chunks.push({ kind: "link", value: match[1] ?? "" });
      last = index + (match[0]?.length ?? 0);
    }
    if (last < text.length) {
      chunks.push({ kind: "text", value: text.slice(last) });
    }
    return chunks;
  }, [text]);

  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, index) => {
        if (part.kind !== "link") {
          return <React.Fragment key={index}>{part.value}</React.Fragment>;
        }
        const parsed = parseMessageLink(part.value);
        if (!parsed.ok) {
          return <React.Fragment key={index}>{part.value}</React.Fragment>;
        }
        const link = parsed.value;
        return (
          <button
            key={index}
            className="text-left text-primary underline decoration-primary/40 underline-offset-2"
            data-testid="bestie-source-message-link"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void goChannel(link.channelId, {
                messageId: link.messageId,
                threadRootId: link.threadRootId,
              });
            }}
            type="button"
          >
            Open message
          </button>
        );
      })}
    </span>
  );
}
