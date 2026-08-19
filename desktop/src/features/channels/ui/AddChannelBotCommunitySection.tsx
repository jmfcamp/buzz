import { Bot, Check } from "lucide-react";

import type { CommunityBot } from "@/features/community-bots/lib/types";
import { cn } from "@/shared/lib/cn";
import { truncatePubkey } from "@/shared/lib/pubkey";

type AddChannelBotCommunitySectionProps = {
  bots: readonly CommunityBot[];
  canToggleSelections: boolean;
  inChannelPubkeys: ReadonlySet<string>;
  isLoading: boolean;
  onToggleBot: (pubkey: string) => void;
  selectedPubkeys: readonly string[];
};

export function AddChannelBotCommunitySection({
  bots,
  canToggleSelections,
  inChannelPubkeys,
  isLoading,
  onToggleBot,
  selectedPubkeys,
}: AddChannelBotCommunitySectionProps) {
  const available = bots.filter((bot) => !inChannelPubkeys.has(bot.pubkey));
  const inChannel = bots.filter((bot) => inChannelPubkeys.has(bot.pubkey));

  if (!isLoading && bots.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      <div className="px-3 pb-1 text-xs font-medium text-muted-foreground">
        Community bots
      </div>
      {isLoading ? (
        <p className="px-3 text-sm text-muted-foreground">
          Loading community bots…
        </p>
      ) : null}
      {available.map((bot) => {
        const selected = selectedPubkeys.includes(bot.pubkey);
        return (
          <button
            aria-pressed={selected}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/60",
              !canToggleSelections && "cursor-not-allowed opacity-50",
            )}
            data-testid={`add-channel-community-bot-${bot.id}`}
            disabled={!canToggleSelections}
            key={bot.pubkey}
            onClick={() => onToggleBot(bot.pubkey)}
            type="button"
          >
            <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {bot.name}
              </span>
              <span className="block truncate font-mono text-2xs text-muted-foreground">
                {truncatePubkey(bot.pubkey)}
              </span>
            </span>
            <span
              aria-hidden
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background",
              )}
            >
              {selected ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
          </button>
        );
      })}
      {inChannel.map((bot) => (
        <div
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground"
          data-testid={`add-channel-community-bot-in-channel-${bot.id}`}
          key={bot.pubkey}
        >
          <Bot className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {bot.name}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium">
            <Check className="h-4 w-4" />
            In channel
          </span>
        </div>
      ))}
    </div>
  );
}
