import type * as React from "react";
import { Hash } from "lucide-react";

import { cn } from "@/shared/lib/cn";

export type ChannelIntroAction = {
  description?: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  testId?: string;
};

export type ChannelIntro = {
  actions?: ChannelIntroAction[];
  channelKindLabel: string;
  channelName: string;
  description?: string | null;
  hideBeginning?: boolean;
  icon?: React.ReactNode;
};

/**
 * The empty-channel intro block: channel icon with action pills beside it,
 * then the channel name underneath. Rendered both as the virtualized
 * timeline's leading row and as the non-virtualized empty state — one
 * component so the two surfaces cannot drift and the first message always
 * lands below it without layout shift.
 */
export function ChannelIntroBlock({
  className,
  intro,
}: {
  className?: string;
  intro: ChannelIntro;
}) {
  const actions = intro.actions ?? [];

  return (
    <div
      className={cn(
        "flex w-full flex-col items-start px-3 text-left",
        className,
      )}
      data-testid="message-channel-intro"
    >
      <div className="flex w-full min-w-0 items-center gap-3">
        <div
          className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/40 text-muted-foreground"
          data-testid="message-channel-intro-icon"
        >
          {intro.icon ?? <Hash aria-hidden className="h-7 w-7" />}
        </div>
        {actions.length ? (
          <div
            className="flex min-w-0 flex-wrap items-center gap-2"
            data-testid="message-channel-intro-actions"
          >
            {actions.map((action) => (
              <button
                className="inline-flex h-[60px] shrink-0 items-center gap-2.5 rounded-full border border-border/70 bg-background/70 pl-2.5 pr-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={action.testId}
                key={action.label}
                onClick={action.onClick}
                type="button"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4"
                  data-testid={
                    action.testId ? `${action.testId}-icon` : undefined
                  }
                >
                  {action.icon}
                </span>
                <span className="min-w-0">
                  <span
                    className="block whitespace-nowrap text-sm font-medium leading-5 text-foreground"
                    data-testid={
                      action.testId ? `${action.testId}-title` : undefined
                    }
                  >
                    {action.label}
                  </span>
                  {action.description ? (
                    <span
                      className="block whitespace-nowrap text-sm leading-5 text-muted-foreground"
                      data-testid={
                        action.testId
                          ? `${action.testId}-description`
                          : undefined
                      }
                    >
                      {action.description}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <p className="mt-4 max-w-2xl truncate text-xl font-semibold leading-7 tracking-tight text-foreground">
        #{intro.channelName}
      </p>
      {intro.hideBeginning ? null : (
        <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
          This is the beginning of the{" "}
          <span className="font-medium text-foreground">
            {intro.channelKindLabel}
          </span>
          .
        </p>
      )}
      {intro.description ? (
        <p className="mt-2 max-w-xl whitespace-pre-line text-sm leading-5 text-muted-foreground">
          {intro.description}
        </p>
      ) : null}
    </div>
  );
}
