// Phone "Me" tab: user card plus entry points for pages without their own tab. Settings opens the existing (web
// read-only for desktop-owned items) Settings screen.
import {
  Blocks,
  Bot,
  BotMessageSquare,
  ChevronRight,
  FolderKanban,
  Globe,
  MessageSquareHeart,
  Settings,
  Workflow,
} from "lucide-react";
import * as React from "react";

import { ProfileAvatar } from "@/features/profile/ui/ProfileAvatar";
import {
  resolveSidebarMenuCount,
  shouldShowSidebarMenuCount,
} from "@/features/sidebar/lib/sidebarMenuCounts";
import { useSidebarMenuCounts } from "@/features/sidebar/lib/useSidebarMenuCounts";
import { FeatureGate } from "@/shared/features";
import { PresenceDot } from "@/features/presence/ui/PresenceBadge";
import { getPresenceLabel } from "@/features/presence/lib/presence";
import { SetStatusDialog } from "@/features/user-status/ui/SetStatusDialog";
import type { UserStatusInput } from "@/features/user-status/types";
import type { PresenceStatus, UserStatus } from "@/shared/api/types";

import { PhonePinnedSitesCard } from "./PhonePinnedSitesCard";
import { PhoneTabLongPress } from "./PhoneTabLongPress";
import type { SurfaceTabTarget } from "@/app/surfaceTabs/surfaceTabModel";

type Row = {
  id: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  /** Sidebar count (Appearance "Show counts on menu items"), when this row has one. */
  count?: { value: number | string | undefined; enabled: boolean };
  feature?: string;
};

// Settings has no surface-tab target (desktop can't tab it either), so it has no long-press menu.
const TAB_TARGETS: Record<string, SurfaceTabTarget> = {
  projects: { kind: "projects" },
  agents: { kind: "agents" },
  bots: { kind: "bots" },
  browsers: { kind: "browsers" },
  workflows: { kind: "workflows" },
};

const ACTION_TILE_CLASS =
  "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-2 py-3 text-center active:bg-accent disabled:opacity-50";

export function PhoneMeScreen({
  displayName,
  avatarUrl,
  pubkey,
  onSettings,
  onAgents,
  onBots,
  onBrowsers,
  onProjects,
  onWorkflows,
  onOpenPinnedSite,
  onManagePinnedSites,
  presenceStatus,
  userStatus,
  onSetUserStatus,
  onClearUserStatus,
  onSendFeedback,
  renderCommunityTile,
}: {
  displayName: string;
  avatarUrl?: string | null;
  pubkey?: string;
  onSettings: () => void;
  onAgents: () => void;
  onBots: () => void;
  onBrowsers: () => void;
  onProjects: () => void;
  onWorkflows: () => void;
  onOpenPinnedSite: (pinId: string) => void;
  onManagePinnedSites: () => void;
  presenceStatus?: PresenceStatus;
  userStatus?: UserStatus;
  onSetUserStatus?: (status: UserStatusInput) => void;
  onClearUserStatus?: () => void;
  onSendFeedback?: () => void;
  /** Renders the community switcher as a tile, given the shared tile class. */
  renderCommunityTile?: (className: string) => React.ReactNode;
}) {
  const [statusOpen, setStatusOpen] = React.useState(false);
  const { preferences, counts } = useSidebarMenuCounts();
  // Same order as the desktop left-nav primary menu (Projects, Agents, Bots, Browsers, Workflows). Settings is the
  // cog tile in the header.
  const rows: Row[] = [
    {
      id: "projects",
      label: "Projects",
      Icon: FolderKanban,
      onSelect: onProjects,
    },
    {
      id: "agents",
      label: "Agents",
      Icon: BotMessageSquare,
      onSelect: onAgents,
      count: { value: counts.agents, enabled: preferences.agents },
    },
    {
      id: "bots",
      label: "Bots",
      Icon: Bot,
      onSelect: onBots,
      count: { value: counts.bots, enabled: preferences.bots },
    },
    {
      id: "browsers",
      label: "Browsers",
      Icon: Globe,
      onSelect: onBrowsers,
      count: { value: counts.browsers, enabled: preferences.browsers },
    },
    {
      id: "workflows",
      label: "Workflows",
      Icon: Workflow,
      onSelect: onWorkflows,
      feature: "workflows",
    },
  ];
  const npubShort = pubkey ? `${pubkey.slice(0, 8)}…${pubkey.slice(-6)}` : "";
  return (
    <div
      className="phone-screen flex h-full flex-col overflow-y-auto bg-background"
      data-testid="phone-me-screen"
    >
      <div className="flex items-center gap-3 px-4 pb-4 pt-6">
        <ProfileAvatar
          avatarUrl={avatarUrl ?? null}
          className="h-14 w-14 text-lg"
          label={displayName}
          pubkey={pubkey}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold">{displayName}</div>
          {npubShort ? (
            <div className="truncate font-mono text-xs text-muted-foreground">
              {npubShort}
            </div>
          ) : null}
        </div>
        <button
          aria-label="Settings"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground active:bg-accent"
          data-testid="phone-me-settings"
          onClick={onSettings}
          title="Settings"
          type="button"
        >
          <Settings className="h-6 w-6" />
        </button>
      </div>
      <div className="mx-3 mb-3 grid grid-cols-3 gap-2" data-testid="phone-me-actions">
        <button
          aria-label="Status"
          className={ACTION_TILE_CLASS}
          data-testid="phone-me-status"
          disabled={!onSetUserStatus}
          onClick={() => setStatusOpen(true)}
          type="button"
        >
          <span className="flex h-[18px] items-center">
            {presenceStatus ? (
              <PresenceDot className="h-3 w-3" status={presenceStatus} />
            ) : (
              <span className="h-3 w-3 rounded-full bg-muted-foreground/40" />
            )}
          </span>
          <span className="text-[13px] font-medium">Status</span>
          <span className="max-w-full truncate text-xs text-muted-foreground">
            {userStatus?.text || userStatus?.emoji
                ? `${userStatus.emoji ? `${userStatus.emoji} ` : ""}${userStatus.text}`
                : presenceStatus
                  ? getPresenceLabel(presenceStatus)
                  : "Set status"}
          </span>
        </button>
        {renderCommunityTile ? (
          renderCommunityTile(ACTION_TILE_CLASS)
        ) : (
          <div className={ACTION_TILE_CLASS} />
        )}
        <button
          aria-label="Send feedback"
          className={ACTION_TILE_CLASS}
          data-testid="phone-me-feedback"
          disabled={!onSendFeedback}
          onClick={onSendFeedback}
          type="button"
        >
          <MessageSquareHeart className="h-[18px] w-[18px] text-muted-foreground" />
          <span className="text-[13px] font-medium">Feedback</span>
          <span className="max-w-full truncate text-xs text-muted-foreground">Send</span>
        </button>
      </div>
      <ul className="mx-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {rows.map(({ id, label, Icon, onSelect, count, feature }) => {
          const showCount =
            count != null &&
            shouldShowSidebarMenuCount({
              preferenceEnabled: count.enabled,
              count: count.value,
            });
          const countLabel =
            count == null
              ? undefined
              : typeof count.value === "string"
                ? count.value
                : resolveSidebarMenuCount(count.value);
          const row = (
            <li key={id}>
              <PhoneTabLongPress label={label} target={TAB_TARGETS[id] ?? null}>
                <button
                  className="phone-long-press flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] active:bg-accent"
                  data-testid={`phone-me-${id}`}
                  onClick={onSelect}
                  type="button"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span className="flex-1">{label}</span>
                  {showCount && countLabel !== undefined ? (
                    <span
                      className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary"
                      data-testid={`phone-me-${id}-count`}
                    >
                      {countLabel}
                    </span>
                  ) : null}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </PhoneTabLongPress>
            </li>
          );
          return feature ? (
            <FeatureGate feature={feature} key={id}>
              {row}
            </FeatureGate>
          ) : (
            row
          );
        })}
      </ul>
      <PhonePinnedSitesCard
        onManage={onManagePinnedSites}
        onOpen={onOpenPinnedSite}
      />
      <p className="flex items-center gap-1.5 px-5 pt-4 text-xs text-muted-foreground">
        <Blocks className="h-3.5 w-3.5" /> Desktop-owned settings are read-only
        on the web.
      </p>
      {onSetUserStatus && onClearUserStatus ? (
        <SetStatusDialog
          hasExistingStatus={Boolean(userStatus?.text || userStatus?.emoji)}
          initialEmoji={userStatus?.emoji}
          initialExpiresAt={userStatus?.expiresAt}
          initialText={userStatus?.text}
          initialUpdatedAt={userStatus?.updatedAt}
          onClear={onClearUserStatus}
          onOpenChange={setStatusOpen}
          onSave={onSetUserStatus}
          open={statusOpen}
        />
      ) : null}
    </div>
  );
}
