import { Home, X } from "lucide-react";
import * as React from "react";

import { useAppShell } from "@/app/AppShellContext";
import {
  surfaceTabAccessibleName,
  surfaceTabMark,
  type SurfaceTabMark,
} from "@/app/surfaceTabs/surfaceTabAttention";
import {
  type SurfaceTab,
  surfaceTabFullLabel,
  truncateSurfaceTabLabel,
} from "@/app/surfaceTabs/surfaceTabModel";
import { useOptionalSurfaceTabs } from "@/app/surfaceTabs/SurfaceTabsProvider";
import { useActiveWorkingChannelsById } from "@/features/sidebar/lib/useActiveWorkingChannelsById";
import { useSidebarMenuCounts } from "@/features/sidebar/lib/useSidebarMenuCounts";
import {
  ChannelWorkingBadge,
  formatWorkingTooltip,
} from "@/features/sidebar/ui/channelWorkingBadge";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";

// Fixed px on purpose: this control sits on the traffic-light row, whose
// buttons ignore Cmd +/- rem zoom. The label still uses the text-xs token.
const TAB_BUTTON_CLASS =
  "flex h-[28px] min-w-0 max-w-48 items-center rounded-[4px] px-2 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

/** Home control. It leaves a fullscreen tab and restores the normal layout. */
export function SurfaceTabHomeButton({ className }: { className?: string }) {
  const tabs = useOptionalSurfaceTabs();
  if (!tabs) return null;
  const normal = tabs.activeId === null;

  return (
    <Button
      aria-keyshortcuts="Meta+`"
      aria-label="Home"
      aria-pressed={normal}
      className={cn(
        className,
        "[&_svg]:size-[16px]",
        normal && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
      data-testid="surface-tab-home"
      onClick={() => {
        tabs.showNormalLayout();
      }}
      size="icon"
      title="Normal view"
      type="button"
      variant="ghost"
    >
      <Home />
    </Button>
  );
}

const QUIET_MARK: SurfaceTabMark = { bold: false, countLabel: null };

function useSurfaceTabMarks(
  tabs: readonly SurfaceTab[],
): ReadonlyMap<string, SurfaceTabMark> {
  const {
    dmChannelIds,
    hasSidebarUnreadProjections,
    unreadChannelCounts,
    unreadChannelIds,
    unreadThreadChannelIds,
    unreadThreadFeedItems,
  } = useAppShell();
  const { counts, preferences } = useSidebarMenuCounts();
  return React.useMemo(() => {
    const marks = new Map<string, SurfaceTabMark>();
    for (const tab of tabs) {
      marks.set(
        tab.id,
        surfaceTabMark({
          dmChannelIds,
          hasSidebarUnreadProjections,
          menuCounts: counts,
          menuPreferences: preferences,
          target: tab.target,
          unreadChannelCounts,
          unreadChannelIds,
          unreadThreadChannelIds,
          unreadThreadFeedItems,
        }),
      );
    }
    return marks;
  }, [
    counts,
    dmChannelIds,
    hasSidebarUnreadProjections,
    preferences,
    tabs,
    unreadChannelCounts,
    unreadChannelIds,
    unreadThreadChannelIds,
    unreadThreadFeedItems,
  ]);
}

/** Chrome-style tabs for surfaces pinned from the left panel. */
function tabChannelId(tab: SurfaceTab): string | null {
  if (tab.target.kind === "channel" || tab.target.kind === "thread") {
    return tab.target.channelId;
  }
  return null;
}

export function SurfaceTabStrip({ className }: { className?: string }) {
  const tabs = useOptionalSurfaceTabs();
  const marks = useSurfaceTabMarks(tabs?.tabs ?? []);
  const workingByChannelId = useActiveWorkingChannelsById();
  if (!tabs || tabs.tabs.length === 0) return null;

  return (
    <div
      aria-label="Tabs"
      className={cn(
        "ml-1 flex min-w-0 max-w-[55%] shrink items-center gap-0.5 overflow-x-auto",
        className,
      )}
      data-surface-tab-strip
      data-testid="surface-tab-strip"
      role="tablist"
    >
      {tabs.tabs.map((tab, index) => {
        const full = surfaceTabFullLabel(tab.label);
        const visible = truncateSurfaceTabLabel(tab.label);
        const selected = tabs.activeId === tab.id;
        const mark = marks.get(tab.id) ?? QUIET_MARK;
        const channelId = tabChannelId(tab);
        const working = channelId
          ? workingByChannelId.get(channelId)
          : undefined;
        const workingLabel = working ? formatWorkingTooltip(working) : null;
        const accessibleName = surfaceTabAccessibleName(
          tab.label,
          mark,
          workingLabel,
        );
        return (
          <div
            className={cn(
              "flex min-w-0 shrink-0 items-center rounded-[4px]",
              selected
                ? "bg-background text-foreground shadow-xs"
                : "text-sidebar-foreground/70",
            )}
            key={tab.id}
          >
            <button
              aria-keyshortcuts={index < 9 ? `Meta+${index + 1}` : undefined}
              aria-label={accessibleName}
              aria-selected={selected}
              className={cn(
                TAB_BUTTON_CLASS,
                "gap-1 rounded-r-none pr-1",
                mark.bold && "font-bold",
                mark.bold && !selected && "text-sidebar-foreground",
              )}
              data-testid={`surface-tab-${tab.id}`}
              data-unread={mark.bold ? "true" : "false"}
              onClick={() => {
                tabs.selectTab(tab.id);
              }}
              role="tab"
              title={accessibleName}
              type="button"
            >
              <span className="min-w-0 truncate">{visible}</span>
              {working ? (
                <ChannelWorkingBadge
                  channelName={visible}
                  isActive={selected}
                  summary={working}
                  testId={`surface-tab-working-${tab.id}`}
                  variant="tab"
                />
              ) : null}
              {mark.countLabel ? (
                <span
                  aria-hidden="true"
                  className="shrink-0 rounded-full bg-primary/15 px-1.5 text-2xs tabular-nums text-primary"
                  data-testid={`surface-tab-count-${tab.id}`}
                >
                  {mark.countLabel}
                </span>
              ) : null}
            </button>
            <button
              aria-keyshortcuts={selected ? "Meta+F4" : undefined}
              aria-label={`Close ${full}`}
              className="mr-0.5 flex size-5 shrink-0 items-center justify-center rounded-[4px] text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              data-testid={`surface-tab-close-${tab.id}`}
              onClick={() => {
                tabs.closeTab(tab.id);
              }}
              type="button"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
