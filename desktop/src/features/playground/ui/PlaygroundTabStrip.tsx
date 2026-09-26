import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/shared/lib/cn";

import {
  isMainBrowserTab,
  type PlaygroundBrowser,
} from "../lib/browserGroups";
import type { PlaygroundSession } from "../lib/sessions";

export function PlaygroundTabStrip({
  browser,
  sessions,
  onSelect,
  onClose,
}: {
  browser: PlaygroundBrowser;
  sessions: ReadonlyMap<string, PlaygroundSession>;
  onSelect: (sid: string) => void;
  onClose: (sid: string) => void;
}) {
  return (
    <div
      className="flex min-h-7 min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto"
      data-testid="playground-tab-strip"
      role="tablist"
    >
      {browser.tabSids.map((sid) => {
        const session = sessions.get(sid);
        const title = session?.name || session?.url || "Tab";
        const active = browser.activeTabSid === sid;
        const isMain = isMainBrowserTab(browser, sid);
        return (
          <div
            aria-selected={active}
            className={cn(
              "group flex max-w-[12rem] min-w-0 shrink-0 items-center gap-0.5 rounded-t-md border border-b-0 px-1.5 py-0.5 text-2xs",
              active
                ? "border-border bg-background text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            data-active={active ? "true" : undefined}
            data-main-tab={isMain ? "true" : undefined}
            data-testid={`playground-tab-${sid}`}
            key={sid}
            role="tab"
          >
            <button
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => onSelect(sid)}
              title={title}
              type="button"
            >
              {title}
            </button>
            {isMain ? null : (
              <button
                aria-label={`Close ${title}`}
                className={cn(
                  "rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground",
                  active ? "opacity-80" : "opacity-0 group-hover:opacity-80",
                )}
                data-testid={`playground-tab-close-${sid}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onClose(sid);
                }}
                type="button"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
