import { Bell, BellOff, BellRing, Check } from "lucide-react";

import { useAppShell } from "@/app/AppShellContext";
import {
  type ChannelNotifyMode,
  channelNotifyMode,
  useChannelNotifySets,
} from "@/features/inbox/channelNotify";
import { setChannelNotifyMode } from "@/features/inbox/inboxStateSync";
import { useIdentityQuery } from "@/shared/api/hooks";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

const OPTIONS: Array<{
  mode: ChannelNotifyMode;
  label: string;
  hint: string;
}> = [
  {
    mode: "all",
    label: "All messages",
    hint: "Every new post shows in your Inbox",
  },
  {
    mode: "mentions",
    label: "Mentions only",
    hint: "Only @you and threads you follow",
  },
  { mode: "mute", label: "Mute", hint: "Hidden, except a direct @you" },
];

/** Channel header bell: All messages / Mentions only (default) / Mute. */
export function ChannelNotifyMenu({ channelId }: { channelId: string }) {
  const pubkey = useIdentityQuery().data?.pubkey;
  const sets = useChannelNotifySets(pubkey);
  const { mutedChannelIds, muteChannel, unmuteChannel } = useAppShell();
  // Legacy channel mutes (sidebar dimming, toasts) stay in step with the doc.
  const mode: ChannelNotifyMode =
    sets.muted.has(channelId) || mutedChannelIds.has(channelId)
      ? "mute"
      : channelNotifyMode(sets, channelId);
  const Icon = mode === "all" ? BellRing : mode === "mute" ? BellOff : Bell;

  const choose = (next: ChannelNotifyMode) => {
    setChannelNotifyMode(pubkey, channelId, next);
    if (next === "mute") muteChannel(channelId);
    else if (mutedChannelIds.has(channelId)) unmuteChannel(channelId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Notifications: ${OPTIONS.find((o) => o.mode === mode)?.label}`}
          data-testid="channel-notify-trigger"
          size="icon"
          title="Notifications"
          type="button"
          variant="outline"
        >
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            data-testid={`channel-notify-${option.mode}`}
            key={option.mode}
            onClick={() => choose(option.mode)}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm">{option.label}</span>
              <span className="text-xs text-muted-foreground">
                {option.hint}
              </span>
            </span>
            {mode === option.mode ? <Check className="h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
