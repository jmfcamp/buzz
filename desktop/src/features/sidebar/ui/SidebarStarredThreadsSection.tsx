import { ChevronDown, MessageSquare, Pencil, StarOff } from "lucide-react";
import * as React from "react";
import { useLocation } from "@tanstack/react-router";

import { useAppShell } from "@/app/AppShellContext";
import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useOptionalSurfaceTabs } from "@/app/surfaceTabs/SurfaceTabsProvider";
import type { ActiveChannelTurnSummary } from "@/features/agents/activeAgentTurnsStore";
import {
  countUnreadForStarredThreadRoot,
  formatSidebarUnreadCount,
} from "@/features/sidebar/lib/starredThreadSidebar";
import { starredThreadTitle } from "@/features/sidebar/lib/threadLabels";
import type { StarredThreadEntry } from "@/features/sidebar/lib/threadStarsStorage";
import { useThreadLabels } from "@/features/sidebar/lib/useThreadLabels";
import { ThreadRenameDialog } from "@/features/messages/ui/ThreadRenameDialog";
import { StatusEmoji } from "@/features/user-status/ui/StatusEmoji";
import {
  ChannelWorkingBadge,
  formatWorkingTooltip,
} from "@/features/sidebar/ui/channelWorkingBadge";
import { cn } from "@/shared/lib/cn";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { AddSurfaceTabMenuItem } from "@/features/sidebar/ui/AddSurfaceTabMenuItem";
import { deferMenuAction } from "@/features/sidebar/ui/sidebarMenuHelpers";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/shared/ui/sidebar";

const SECTION_LABEL_BUTTON_CLASS =
  "group/section-label flex w-fit max-w-[calc(100%-3rem)] cursor-pointer appearance-none items-center gap-1 text-left transition-colors hover:text-sidebar-foreground focus-visible:text-sidebar-foreground";
const SECTION_LABEL_CHEVRON_CLASS =
  "relative size-2.5 shrink-0 text-current opacity-0 transition-[color,opacity] group-hover/sidebar-section:opacity-100 group-hover/section-label:opacity-100 group-focus-within/sidebar-section:opacity-100 group-focus-visible/section-label:opacity-100";
const SECTION_LABEL_CHEVRON_ICON_CLASS =
  "absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2";

function selectedThreadRootFromSearch(search: unknown): string | null {
  if (typeof search !== "object" || search === null) return null;
  const record = search as { thread?: unknown; threadRootId?: unknown };
  const thread = record.threadRootId ?? record.thread;
  return typeof thread === "string" && thread.trim() ? thread.trim() : null;
}

function StarredThreadRow({
  entry,
  displayTitle,
  icon,
  isActive,
  unreadCount,
  activeWorking,
  onRename,
  onSelect,
  onUnstar,
}: {
  entry: StarredThreadEntry;
  displayTitle: string;
  icon?: string;
  isActive: boolean;
  unreadCount: number;
  activeWorking?: ActiveChannelTurnSummary;
  onRename?: () => void;
  onSelect: () => void;
  onUnstar: () => void;
}) {
  const hasUnread = unreadCount > 0;
  const workingTitle = activeWorking
    ? formatWorkingTooltip(activeWorking)
    : undefined;
  const rowLabel = `${displayTitle} · #${entry.channelName}`;
  const suppressCloseAutoFocusRef = React.useRef(false);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarMenuItem>
          <SidebarMenuButton
            className={cn(
              "h-8 data-[active=true]:font-normal",
              hasUnread &&
                "font-bold text-sidebar-foreground hover:text-sidebar-foreground data-[active=true]:font-bold",
            )}
            data-testid={`starred-thread-${entry.rootId}`}
            isActive={isActive}
            onClick={onSelect}
            title={workingTitle ? `${rowLabel} · ${workingTitle}` : rowLabel}
            tooltip={rowLabel}
          >
            {icon ? (
              <span
                aria-hidden="true"
                className="flex h-4 w-4 shrink-0 items-center justify-center"
                data-testid={`starred-thread-icon-${entry.rootId}`}
              >
                <StatusEmoji className="h-4 w-4" decorative value={icon} />
              </span>
            ) : (
              <MessageSquare className="h-4 w-4 shrink-0" />
            )}
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-left",
                !isActive && !hasUnread && "opacity-80",
              )}
            >
              {displayTitle}
            </span>
            {activeWorking ? (
              <ChannelWorkingBadge
                channelName={entry.channelName}
                isActive={isActive}
                summary={activeWorking}
                testId={`starred-thread-working-${entry.rootId}`}
              />
            ) : null}
            <span className="min-w-0 max-w-[40%] truncate text-2xs text-sidebar-foreground/55">
              #{entry.channelName}
            </span>
            {hasUnread ? (
              <span
                className={cn(
                  "ml-auto shrink-0 rounded-full px-1.5 text-2xs tabular-nums",
                  isActive
                    ? "bg-sidebar-active-foreground/20 text-sidebar-active-foreground"
                    : "bg-primary/15 text-primary",
                )}
                data-testid={`starred-thread-unread-${entry.rootId}`}
              >
                {formatSidebarUnreadCount(unreadCount)}
                <span className="sr-only">
                  {" "}
                  unread{unreadCount === 1 ? "" : "s"}
                </span>
              </span>
            ) : null}
          </SidebarMenuButton>
        </SidebarMenuItem>
      </ContextMenuTrigger>
      <ContextMenuContent
        onCloseAutoFocus={(event) => {
          // Opening Rename mounts a modal Dialog; Radix would restore focus to
          // the row and immediately dismiss that Dialog (flash then gone).
          if (suppressCloseAutoFocusRef.current) event.preventDefault();
        }}
      >
        <AddSurfaceTabMenuItem
          divided
          label={displayTitle}
          target={{
            kind: "thread",
            channelId: entry.channelId,
            rootId: entry.rootId,
          }}
        />
        {onRename ? (
          <ContextMenuItem
            data-testid={`starred-thread-rename-${entry.rootId}`}
            onSelect={() => {
              suppressCloseAutoFocusRef.current = true;
              deferMenuAction(() => {
                onRename();
                globalThis.setTimeout(() => {
                  suppressCloseAutoFocusRef.current = false;
                }, 400);
              });
            }}
          >
            <Pencil className="h-4 w-4" />
            <span>Rename</span>
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          onSelect={() => {
            onUnstar();
          }}
        >
          <StarOff className="h-4 w-4" />
          <span>Unstar thread</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function SidebarStarredThreadsSection({
  activeWorkingByChannelId,
  currentPubkey,
  isCollapsed,
  items,
  onToggleCollapsed,
  onUnstarThread,
}: {
  activeWorkingByChannelId?: ReadonlyMap<string, ActiveChannelTurnSummary>;
  currentPubkey?: string;
  isCollapsed: boolean;
  items: readonly StarredThreadEntry[];
  onToggleCollapsed: () => void;
  onUnstarThread: (rootId: string) => void;
}) {
  const { goChannel } = useAppNavigation();
  const surfaceTabs = useOptionalSurfaceTabs();
  const location = useLocation();
  const { unreadThreadFeedItems } = useAppShell();
  const { labelFor, setThreadLabel } = useThreadLabels(currentPubkey);
  // Snapshot the row when Rename is chosen so a starred-list refresh mid-dialog
  // (thread-labels sync) cannot drop the rename target and close the dialog.
  const [renameTarget, setRenameTarget] = React.useState<{
    rootId: string;
    title: string;
  } | null>(null);
  const selectedThreadRootId = React.useMemo(
    () => selectedThreadRootFromSearch(location.search),
    [location.search],
  );
  const unreadCountByRootId = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of items) {
      const count = countUnreadForStarredThreadRoot(
        unreadThreadFeedItems,
        entry.rootId,
      );
      if (count > 0) counts.set(entry.rootId, count);
    }
    return counts;
  }, [items, unreadThreadFeedItems]);
  // Value-stable key so thread-labels sync re-notifies (new labelFor identity)
  // do not thrash surface-tab renames / remounts while the rename dialog is open.
  const threadTabLabelsKey = React.useMemo(
    () =>
      items
        .map((entry) => {
          const saved = labelFor(entry.rootId)?.name ?? "";
          return `${entry.rootId}\0${entry.channelId}\0${starredThreadTitle(entry.title, saved)}`;
        })
        .join("\n"),
    [items, labelFor],
  );
  React.useEffect(() => {
    if (!surfaceTabs) return;
    for (const entry of items) {
      surfaceTabs.renameThreadTab({
        channelId: entry.channelId,
        label: starredThreadTitle(entry.title, labelFor(entry.rootId)?.name),
        rootId: entry.rootId,
      });
    }
  }, [surfaceTabs, threadTabLabelsKey, items, labelFor]);
  const contentId = "sidebar-starred-threads-list";

  const renameLabel = renameTarget ? labelFor(renameTarget.rootId) : undefined;

  // Keep the rename dialog mounted even if the starred list is briefly empty
  // (e.g. sync refresh), so a mid-open rename does not unmount/crash.
  if (items.length === 0 && renameTarget === null) {
    return null;
  }

  return (
    <>
      {items.length > 0 ? (
      <SidebarGroup
        className="group/sidebar-section select-none"
        data-testid="starred-threads-section"
      >
        <div className="relative">
          <SidebarGroupLabel asChild>
            <button
              aria-controls={contentId}
              aria-expanded={!isCollapsed}
              className={SECTION_LABEL_BUTTON_CLASS}
              data-testid="starred-threads-section-label"
              onClick={onToggleCollapsed}
              type="button"
            >
              <span data-sidebar-section-title>Starred threads</span>
              <span aria-hidden="true" className={SECTION_LABEL_CHEVRON_CLASS}>
                <ChevronDown
                  className={cn(
                    SECTION_LABEL_CHEVRON_ICON_CLASS,
                    isCollapsed ? "-rotate-90" : "rotate-0",
                  )}
                />
              </span>
            </button>
          </SidebarGroupLabel>
        </div>
        {!isCollapsed ? (
          <SidebarGroupContent id={contentId}>
            <SidebarMenu data-testid="starred-threads-list">
              {items.map((entry) => {
                const label = labelFor(entry.rootId);
                return (
                  <StarredThreadRow
                    key={entry.rootId}
                    activeWorking={activeWorkingByChannelId?.get(
                      entry.channelId,
                    )}
                    displayTitle={starredThreadTitle(entry.title, label?.name)}
                    entry={entry}
                    icon={label?.icon}
                    isActive={selectedThreadRootId === entry.rootId}
                    onRename={
                      currentPubkey
                        ? () =>
                            setRenameTarget({
                              rootId: entry.rootId,
                              title: entry.title,
                            })
                        : undefined
                    }
                    onSelect={() => {
                      void goChannel(entry.channelId, { thread: entry.rootId });
                    }}
                    onUnstar={() => {
                      surfaceTabs?.closeThreadTabs({
                        channelId: entry.channelId,
                        rootId: entry.rootId,
                      });
                      onUnstarThread(entry.rootId);
                    }}
                    unreadCount={unreadCountByRootId.get(entry.rootId) ?? 0}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        ) : null}
      </SidebarGroup>
      ) : null}
      <ThreadRenameDialog
        allowEmpty={false}
        initialIcon={renameLabel?.icon ?? ""}
        initialName={
          renameTarget
            ? starredThreadTitle(renameTarget.title, renameLabel?.name)
            : ""
        }
        onConfirm={({ name, icon }) => {
          if (!renameTarget) return;
          setThreadLabel(renameTarget.rootId, { name, icon });
        }}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        open={renameTarget !== null}
        showIcon
      />
    </>
  );
}
