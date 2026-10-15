// Phone-only bottom tab bar (rendered only when usePhoneLayout() is true). iPad/desktop never mount it.
import { BotMessageSquare, Inbox, MessagesSquare, Plus, SquareTerminal } from "lucide-react";
import * as ReactRuntime from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";

import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import { useSidebarMenuCounts } from "@/features/sidebar/lib/useSidebarMenuCounts";
import type * as React from "react";

import { cn } from "@/shared/lib/cn";
import type { PhoneTab } from "./phoneTabs";

// Me (avatar) first, then Inbox, Channels, Buzz Term. Search moved to the top nav row (PhoneNavRow); the bottom-right
// slot is the circular Assistant button.
const TABS: { id: PhoneTab; label: string; Icon?: React.ComponentType<{ className?: string }> }[] = [
  { id: "me", label: "Me" },
  { id: "inbox", label: "Inbox", Icon: Inbox },
  { id: "channels", label: "Channels", Icon: MessagesSquare },
  { id: "term", label: "Buzz Term", Icon: SquareTerminal },
];

// Placeholder: for now the Assistant button only offers "+ Add an assistant". Next step syncs with the desktop's
// assistant or lets you pick one from Agents.
function PhoneAssistantButton() {
  const [open, setOpen] = ReactRuntime.useState(false);
  return (
    <>
      <button
        aria-label="Assistant"
        className="phone-assistant-button flex h-full shrink-0 items-center justify-center px-1"
        data-testid="phone-tab-assistant"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
          <BotMessageSquare className="h-[22px] w-[22px]" />
        </span>
      </button>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent
          className="z-[130] rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          data-testid="phone-assistant-sheet"
          side="bottom"
        >
          <SheetHeader>
            <SheetTitle>Assistant</SheetTitle>
            <SheetDescription>
              No assistant set up on this device yet.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-2">
            <button
              className="flex w-full items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-left text-sm font-medium hover:bg-accent"
              data-testid="phone-assistant-add"
              onClick={() => setOpen(false)}
              type="button"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Plus className="h-5 w-5" />
              </span>
              <span className="flex flex-col">
                <span>Add an assistant</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Coming soon: use your desktop's assistant or pick one from Agents.
                </span>
              </span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
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
  return (
    <nav
      aria-label="Primary"
      className="phone-tabbar z-[120] flex text-white"
      data-testid="phone-tabbar"
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active;
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
      <PhoneAssistantButton />
    </nav>
  );
}
