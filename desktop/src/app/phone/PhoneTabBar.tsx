// Phone-only bottom tab bar (rendered only when usePhoneLayout() is true). iPad/desktop never mount it.
import { Bot, Inbox, MessagesSquare, SquareTerminal } from "lucide-react";
import * as ReactRuntime from "react";
import { useUserProfileQuery } from "@/features/profile/hooks";
import { useAssistantPubkey } from "@/shared/lib/assistantIdentity";

import {
  toggleWebAssistant,
  useWebAssistantOpen,
} from "@/features/assistant/ui/WebAssistant";

import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { useSidebarMenuCounts } from "@/features/sidebar/lib/useSidebarMenuCounts";
import type * as React from "react";

import { cn } from "@/shared/lib/cn";
import type { PhoneTab } from "./phoneTabs";

// Me (avatar) first, then Inbox, Channels, Buzz Term. Search moved to the top nav row (PhoneNavRow); the bottom-right
// slot is the "Assist" tab.
const TABS: {
  id: PhoneTab;
  label: string;
  Icon?: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "me", label: "Me" },
  { id: "inbox", label: "Inbox", Icon: Inbox },
  { id: "channels", label: "Channels", Icon: MessagesSquare },
  { id: "term", label: "Buzz Term", Icon: SquareTerminal },
];

// "Assist" tab item: styled like the other tabs; icon = your assistant's avatar (round, Me-tab size) or a robot.
// Tapping opens the web Assistant sheet.
// Label "Assist" only when unselected and showing the robot (no assistant avatar yet). With an avatar, icon-only.
function PhoneAssistTab() {
  const assistantPubkey = useAssistantPubkey();
  const profile = useUserProfileQuery(assistantPubkey ?? undefined).data;
  const avatarUrl = assistantPubkey ? (profile?.avatarUrl ?? null) : null;
  const [failed, setFailed] = ReactRuntime.useState<string | null>(null);
  const showAvatar = Boolean(avatarUrl) && failed !== avatarUrl;
  const open = useWebAssistantOpen();
  const showLabel = !showAvatar && !open;
  return (
    <button
      aria-current={open ? "page" : undefined}
      aria-label="Assist"
      className={cn(
        "phone-tab flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium",
        open ? "text-white" : "text-white/60",
      )}
      data-testid="phone-tab-assistant"
      onClick={() => toggleWebAssistant()}
      title={
        profile?.displayName ? `Assist — ${profile.displayName}` : "Assist"
      }
      type="button"
    >
      <span className="relative flex items-center justify-center">
        {showAvatar && avatarUrl ? (
          <img
            alt=""
            className="phone-tab-avatar rounded-full object-cover"
            data-testid="phone-tab-assistant-avatar"
            onError={() => setFailed(avatarUrl)}
            referrerPolicy="no-referrer"
            src={avatarUrl}
          />
        ) : (
          <Bot
            className="h-[22px] w-[22px]"
            data-testid="phone-tab-assistant-robot"
          />
        )}
      </span>
      {showLabel ? <span className="truncate">Assist</span> : null}
    </button>
  );
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="absolute -right-2.5 -top-1 min-w-[1.1rem] rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-[1.1rem] text-primary-foreground"
      data-testid="phone-tab-badge"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function PhoneTabBar({
  active,
  badges,
  me,
  onSelect,
}: {
  active: PhoneTab;
  me: { avatarUrl?: string | null; displayName: string; pubkey?: string };
  badges: Partial<Record<PhoneTab, number>>;
  onSelect: (tab: PhoneTab) => void;
}) {
  // Inbox unread follows the Appearance "Show counts on menu items" Inbox toggle (same source as the sidebar).
  const { preferences, counts } = useSidebarMenuCounts();
  const tabBadges: Partial<Record<PhoneTab, number>> = {
    ...badges,
    inbox: preferences.inbox ? (counts.inbox ?? 0) : 0,
  };
  // While the Assistant popup is open, Assist is the selected tab (the page behind keeps its own tab).
  const assistantOpen = useWebAssistantOpen();
  return (
    <nav
      aria-label="Primary"
      className="phone-tabbar z-[120] flex text-white"
      data-testid="phone-tabbar"
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active && !assistantOpen;
        return (
          <button
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "phone-tab flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-medium",
              isActive ? "text-white" : "text-white/60",
            )}
            data-testid={`phone-tab-${id}`}
            key={id}
            onClick={() => onSelect(id)}
            type="button"
          >
            {Icon ? (
              <>
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" />
                  <Badge count={tabBadges[id] ?? 0} />
                </span>
                <span className="truncate">{label}</span>
              </>
            ) : (
              <span className="relative" data-testid="phone-tab-me-avatar">
                <ProfileAvatar
                  avatarUrl={me.avatarUrl ?? null}
                  className="phone-tab-avatar text-[11px]"
                  label={me.displayName}
                  pubkey={me.pubkey}
                />
                <span
                  aria-label="Online"
                  className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-900 bg-emerald-500"
                  data-testid="phone-tab-me-online"
                />
              </span>
            )}
          </button>
        );
      })}
      <PhoneAssistTab />
    </nav>
  );
}
