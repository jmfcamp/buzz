// Web Agents page: "Set as assistant" in an agent card's ⋮ menu, and the star badge on the current Assistant's card
// (desktop shows the same badge; its own protected UI sets the Assistant from the agent profile).
import { EllipsisVertical, Star } from "lucide-react";

import { useWebAssistantChoice } from "@/features/assistant/webAssistantChoice";
import type { ManagedAgent } from "@/shared/api/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

export function WebAssistantMenuItem({
  agent,
  isAssistant,
  name,
}: {
  agent: ManagedAgent;
  isAssistant: boolean;
  name: string;
}) {
  const choice = useWebAssistantChoice();
  if (!choice.web) return null;
  return (
    <DropdownMenuItem
      data-testid={`agent-set-assistant-${agent.pubkey}`}
      disabled={choice.disabled}
      onClick={() =>
        void choice.choose(isAssistant ? null : agent.pubkey, name)
      }
      title={choice.disabledReason ?? undefined}
    >
      <Star className={isAssistant ? "h-4 w-4 fill-current" : "h-4 w-4"} />
      {isAssistant
        ? "Remove as assistant"
        : choice.needsUpdate
          ? "Set as assistant (needs desktop update)"
          : "Set as assistant"}
    </DropdownMenuItem>
  );
}

/** ⋮ for agent cards that have no definition menu (Custom / Unknown agents). Web only. */
export function WebAgentAssistantMenu({
  agent,
  isAssistant,
  name,
}: {
  agent: ManagedAgent;
  isAssistant: boolean;
  name: string;
}) {
  const { web, live, disabledReason } = useWebAssistantChoice();
  if (!web) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Open actions for ${name}`}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          data-testid={`agent-actions-${agent.pubkey}`}
          type="button"
        >
          <EllipsisVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {!live && disabledReason ? (
          <p className="max-w-56 px-2 py-1.5 text-xs text-muted-foreground">
            These actions run on your desktop. Connect over Direct to use them.
          </p>
        ) : null}
        <WebAssistantMenuItem
          agent={agent}
          isAssistant={isAssistant}
          name={name}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WebAssistantCardBadge({
  agent,
  isAssistant,
}: {
  agent: ManagedAgent;
  isAssistant: boolean;
}) {
  if (!isAssistant) return null;
  return (
    <span
      aria-label={`${agent.name} is your Assistant`}
      className="inline-flex shrink-0 items-center justify-center text-foreground opacity-50"
      data-testid={`web-assistant-card-badge-${agent.pubkey}`}
      role="img"
      title="Assistant"
    >
      <Star className="h-4 w-4 fill-current" />
    </span>
  );
}
