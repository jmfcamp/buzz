// Phone / iPad Assistant header: Start, Close Thread and "Open conversation" folded into one ⋯ menu so the header
// fits at 390px (desktop-width web keeps them as inline buttons).
import { Ellipsis, Play, SquareArrowOutUpRight, X } from "lucide-react";

import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

export function AssistantHeaderMenu({
  closeConfirm,
  directLive,
  onCloseThread,
  onOpenConversation,
  onStart,
  showCloseThread,
  showStart,
  starting,
}: {
  closeConfirm: boolean;
  directLive: boolean;
  onCloseThread: () => void;
  onOpenConversation: () => void;
  onStart: () => void;
  showCloseThread: boolean;
  showStart: boolean;
  starting: boolean;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Assistant actions"
          className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground [&_svg]:size-5"
          data-testid="web-assistant-more"
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-48"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {showStart ? (
          <DropdownMenuItem
            data-testid="web-assistant-start"
            disabled={!directLive || starting}
            onClick={onStart}
            title={
              directLive
                ? "Start on your desktop"
                : "Needs Direct (your desktop connected)"
            }
          >
            <Play className="h-4 w-4" />
            {starting
              ? "Starting…"
              : directLive
                ? "Start"
                : "Start · Needs Direct"}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          data-testid="web-assistant-open"
          onClick={onOpenConversation}
        >
          <SquareArrowOutUpRight className="h-4 w-4" />
          Open full conversation
        </DropdownMenuItem>
        {showCloseThread ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              data-testid="web-assistant-close-thread"
              onSelect={(event) => {
                // Same two-step as the desktop: the first tap arms "Confirm?" and keeps the menu open.
                if (!closeConfirm) event.preventDefault();
                onCloseThread();
              }}
            >
              <X className="h-4 w-4" />
              {closeConfirm ? "Tap again to close thread" : "Close Thread"}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
