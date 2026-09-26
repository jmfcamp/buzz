import * as React from "react";

import type { TimelineMessage } from "@/features/messages/types";
import type { CommunityBot } from "@/features/community-bots/lib/types";
import type {
  Channel,
  ChannelMember,
  ManagedAgent,
  RelayAgent,
} from "@/shared/api/types";
import { usePanelReturnTarget } from "@/shared/hooks/usePanelReturnTarget";
import { normalizePubkey, truncateNpub } from "@/shared/lib/pubkey";
import {
  channelBotMemberPubkeySet,
  channelMemberPubkeySet,
} from "@/shared/lib/rosterDerivations";
import {
  type AgentSessionReturnTarget,
  resolveAgentSessionCloseTarget,
  resolveAgentSessionReturnTarget,
} from "./agentSessionSelection";
import type { PanelValueSetter } from "./useChannelPanelHistoryState";

export type ChannelAgentSessionAgent = Pick<ManagedAgent, "pubkey" | "name"> & {
  status: ManagedAgent["status"] | "unknown";
  agentSource: "managed" | "member-bot" | "relay";
  canInterruptTurn: boolean;
  channelIds?: string[];
  channels?: string[];
};

type UseChannelAgentSessionsOptions = {
  activeChannel: Channel | null;
  activeChannelId: string | null;
  agentsLoaded: boolean;
  channelMembers?: ChannelMember[];
  handleOpenThread: (message: TimelineMessage) => void;
  managedAgents: ChannelAgentSessionAgent[];
  /** Seeded thread for OS thread companions when Activity dismiss has no Back stack. */
  fallbackThreadHeadId?: string | null;
  openAgentSessionPubkey: string | null;
  openThreadHeadId: string | null;
  profilePanelPubkey?: string | null;
  requireThreadEditResolution: () => boolean;
  setChannelManagementOpen: (open: boolean) => void;
  setExpandedThreadReplyIds: (value: Set<string>) => void;
  setOpenAgentSessionChannelId: PanelValueSetter;
  setOpenAgentSessionPubkey: PanelValueSetter;
  setOpenThreadHeadId: (value: string | null) => void;
  setProfilePanelPubkey: (value: string | null) => void;
  setThreadReplyTargetId: (value: string | null) => void;
  setThreadScrollTargetId: (value: string | null) => void;
};

function relayStatusToManagedStatus(
  status: RelayAgent["status"],
): ChannelAgentSessionAgent["status"] {
  if (status === "unknown") return "unknown";
  return status === "offline" ? "stopped" : "deployed";
}

export function buildChannelAgentSessionCandidates({
  channelMembers,
  communityBots = [],
  communityBotPubkeys = [],
  managedAgents,
  relayAgents,
}: {
  channelMembers?: ChannelMember[];
  /** Installed community-bots catalog (OpenClaw / buzz-acp peers). */
  communityBots?: ReadonlyArray<Pick<CommunityBot, "name" | "pubkey">>;
  /**
   * Extra community-bot pubkeys to trust as session peers (reserved Hula
   * routes). Names fall back to truncateNpub when not in the catalog.
   */
  communityBotPubkeys?: readonly string[];
  managedAgents: ManagedAgent[];
  relayAgents: RelayAgent[];
}): ChannelAgentSessionAgent[] {
  const byPubkey = new Map<string, ChannelAgentSessionAgent>();

  for (const agent of relayAgents) {
    byPubkey.set(normalizePubkey(agent.pubkey), {
      pubkey: agent.pubkey,
      name: agent.name,
      status: relayStatusToManagedStatus(agent.status),
      agentSource: "relay",
      canInterruptTurn: false,
      channelIds: agent.channelIds,
      channels: agent.channels,
    });
  }

  for (const agent of managedAgents) {
    const key = normalizePubkey(agent.pubkey);
    const existing = byPubkey.get(key);
    byPubkey.set(key, {
      pubkey: agent.pubkey,
      name: agent.name,
      status: agent.status,
      agentSource: "managed",
      canInterruptTurn: true,
      channelIds: existing?.channelIds,
      channels: existing?.channels,
    });
  }

  for (const member of channelMembers ?? []) {
    const key = normalizePubkey(member.pubkey);
    if (member.role !== "bot" || byPubkey.has(key)) {
      continue;
    }

    byPubkey.set(key, {
      pubkey: member.pubkey,
      name: member.displayName ?? truncateNpub(member.pubkey),
      status: "deployed",
      agentSource: "member-bot",
      canInterruptTurn: false,
    });
  }

  // Catalog + reserved community bots: treat as member-bot peers whenever they
  // appear on the channel roster (any role) or are explicitly allow-listed.
  // Without this, ACP activity collapses to the human "is typing…" path.
  const catalogByPubkey = new Map(
    communityBots.map((bot) => [normalizePubkey(bot.pubkey), bot] as const),
  );
  const memberKeys = new Set(
    (channelMembers ?? []).map((member) => normalizePubkey(member.pubkey)),
  );
  const allowListed = new Set(
    communityBotPubkeys.map((pubkey) => normalizePubkey(pubkey)).filter(Boolean),
  );
  const extraKeys = new Set([...catalogByPubkey.keys(), ...allowListed]);
  for (const key of extraKeys) {
    if (!key || byPubkey.has(key)) {
      continue;
    }
    // Prefer roster presence; also admit allow-listed/catalog bots that are
    // actively participating (caller passes typing/working pubkeys in
    // communityBotPubkeys for that case).
    const onRoster = memberKeys.has(key);
    const allowListedActive = allowListed.has(key);
    if (!onRoster && !allowListedActive) {
      continue;
    }
    const catalog = catalogByPubkey.get(key);
    const member = (channelMembers ?? []).find(
      (entry) => normalizePubkey(entry.pubkey) === key,
    );
    byPubkey.set(key, {
      pubkey: member?.pubkey ?? catalog?.pubkey ?? key,
      name:
        catalog?.name?.trim() ||
        member?.displayName?.trim() ||
        truncateNpub(key),
      status: "deployed",
      agentSource: "member-bot",
      canInterruptTurn: false,
    });
  }

  return [...byPubkey.values()];
}

export function getChannelAgentSessionAgents({
  activeChannel,
  activeChannelId,
  agents,
  channelMembers,
}: {
  activeChannel: Channel | null;
  activeChannelId: string | null;
  agents: ChannelAgentSessionAgent[];
  channelMembers?: ChannelMember[];
}): ChannelAgentSessionAgent[] {
  if (!activeChannelId || !activeChannel) {
    return [];
  }

  // Identity-cached: the memo recomputes whenever the active channel object
  // churns (e.g. lastMessageAt updates), and these Sets walked the full
  // roster each time.
  const memberPubkeys = channelMembers
    ? channelMemberPubkeySet(channelMembers)
    : null;
  const botMemberPubkeys = channelMembers
    ? channelBotMemberPubkeySet(channelMembers)
    : null;

  return agents.filter((agent) => {
    const normalizedPubkey = normalizePubkey(agent.pubkey);
    const channelIds = agent.channelIds ?? [];
    const channels = agent.channels ?? [];
    const hasDeclaredChannelScope =
      channelIds.length > 0 || channels.length > 0;
    const matchesDeclaredChannel =
      channelIds.includes(activeChannelId) ||
      channels.includes(activeChannel.name);

    if (agent.agentSource === "member-bot") {
      if (botMemberPubkeys?.has(normalizedPubkey)) {
        return true;
      }
      if (memberPubkeys?.has(normalizedPubkey)) {
        return true;
      }
      // Catalog/reserved community bots admitted by the candidate builder for
      // this channel (live typing / working) stay visible so ACP tool/step
      // status can attach instead of falling through to human "is typing…".
      return !hasDeclaredChannelScope;
    }

    if (agent.agentSource === "managed") {
      return memberPubkeys?.has(normalizedPubkey) ?? matchesDeclaredChannel;
    }

    if (matchesDeclaredChannel) {
      return true;
    }

    return (
      !hasDeclaredChannelScope && Boolean(memberPubkeys?.has(normalizedPubkey))
    );
  });
}

export function useChannelAgentSessions({
  activeChannel,
  activeChannelId,
  agentsLoaded,
  channelMembers,
  fallbackThreadHeadId = null,
  handleOpenThread,
  managedAgents,
  openAgentSessionPubkey,
  openThreadHeadId,
  profilePanelPubkey = null,
  requireThreadEditResolution,
  setChannelManagementOpen,
  setExpandedThreadReplyIds,
  setOpenAgentSessionChannelId,
  setOpenAgentSessionPubkey,
  setOpenThreadHeadId,
  setProfilePanelPubkey,
  setThreadReplyTargetId,
  setThreadScrollTargetId,
}: UseChannelAgentSessionsOptions) {
  const channelAgentSessionAgents = React.useMemo(
    () =>
      getChannelAgentSessionAgents({
        activeChannel,
        activeChannelId,
        agents: managedAgents,
        channelMembers,
      }),
    [activeChannel, activeChannelId, channelMembers, managedAgents],
  );
  const agentSessionAgents = managedAgents;

  // Breadcrumb for Activity dismiss (X/Back): captured on the closed→open
  // transition, consumed once on dismiss. Channel switches drop it via the
  // reset key.
  const { hasTarget: hasAgentSessionReturnTarget, store: returnTarget } =
    usePanelReturnTarget<AgentSessionReturnTarget>(activeChannelId);
  const isAgentSessionOpen = openAgentSessionPubkey != null;

  const dismissAgentSession = React.useCallback(() => {
    // X and Back both restore: prefer the Back stack, else the companion's
    // seeded thread. Clearing without restore blanked thread OS pop-outs after
    // #111 lifted them into channel|Activity (single-panel with nothing left).
    const target = resolveAgentSessionCloseTarget({
      fallbackThreadHeadId,
      returnTarget: returnTarget.consume(),
    });
    setOpenAgentSessionPubkey(null);
    if (target?.kind === "thread") {
      setOpenThreadHeadId(target.threadHeadId);
      return;
    }
    if (target?.kind === "profile") {
      setProfilePanelPubkey(target.pubkey);
    }
  }, [
    fallbackThreadHeadId,
    returnTarget,
    setOpenAgentSessionPubkey,
    setOpenThreadHeadId,
    setProfilePanelPubkey,
  ]);
  const closeAgentSession = dismissAgentSession;

  const openAgentSession = React.useCallback(
    (pubkey: string, channelId?: string | null) => {
      if (!requireThreadEditResolution()) return;
      if (!isAgentSessionOpen) {
        returnTarget.capture(
          resolveAgentSessionReturnTarget({
            openThreadHeadId,
            profilePanelPubkey,
          }),
        );
      }
      // Keep the thread mounted beside Activity so live replies stay visible
      // in the main column (ChannelPane prefers Activity on the right). Clearing
      // the thread hid replies until dismiss restored it — especially in OS
      // channel/thread companions after the #111 split lift.
      setExpandedThreadReplyIds(new Set());
      setThreadScrollTargetId(null);
      setThreadReplyTargetId(null);
      setChannelManagementOpen(false);
      setOpenAgentSessionPubkey(pubkey);
      // Fall back to activeChannelId so opening from within a channel always
      // scopes the panel to that channel — even when no explicit channelId is
      // supplied (e.g. activity-list click). Without this, a null channelId
      // bypasses scopeByChannel and lets all channels' live frames through.
      setOpenAgentSessionChannelId(channelId ?? activeChannelId ?? null);
    },
    [
      activeChannelId,
      isAgentSessionOpen,
      openThreadHeadId,
      profilePanelPubkey,
      requireThreadEditResolution,
      returnTarget,
      setChannelManagementOpen,
      setExpandedThreadReplyIds,
      setOpenAgentSessionChannelId,
      setOpenAgentSessionPubkey,
      setThreadReplyTargetId,
      setThreadScrollTargetId,
    ],
  );

  // Back shares dismissAgentSession so X and Back never leave companions blank.
  const backFromAgentSession = dismissAgentSession;

  const selectAgentSession = React.useCallback(
    (pubkey: string, channelId?: string | null) => {
      setOpenAgentSessionPubkey(pubkey);
      // Same fallback as openAgentSession: use activeChannelId when the caller
      // omits channelId, so the panel is always scoped to the current channel.
      setOpenAgentSessionChannelId(channelId ?? activeChannelId ?? null);
    },
    [activeChannelId, setOpenAgentSessionChannelId, setOpenAgentSessionPubkey],
  );

  const openThreadAndCloseAgentSession = React.useCallback(
    (message: TimelineMessage) => {
      returnTarget.clear();
      setOpenAgentSessionPubkey(null);
      setProfilePanelPubkey(null);
      setChannelManagementOpen(false);
      handleOpenThread(message);
    },
    [
      handleOpenThread,
      returnTarget,
      setChannelManagementOpen,
      setOpenAgentSessionPubkey,
      setProfilePanelPubkey,
    ],
  );

  React.useEffect(() => {
    // An empty agent list can mean the queries behind it are still loading
    // (e.g. a reload restoring the agentSession URL param), so wait until the
    // agent queries have settled. Once loaded, a channel that legitimately has
    // zero agents will still auto-close a stale param.
    if (
      openAgentSessionPubkey &&
      agentsLoaded &&
      normalizePubkey(profilePanelPubkey ?? "") !==
        normalizePubkey(openAgentSessionPubkey) &&
      !agentSessionAgents.some(
        (agent) =>
          normalizePubkey(agent.pubkey) ===
          normalizePubkey(openAgentSessionPubkey),
      )
    ) {
      returnTarget.clear();
      setOpenAgentSessionPubkey(null, { replace: true });
    }
  }, [
    agentSessionAgents,
    agentsLoaded,
    openAgentSessionPubkey,
    profilePanelPubkey,
    returnTarget,
    setOpenAgentSessionPubkey,
  ]);

  return {
    agentSessionAgents,
    backFromAgentSession,
    channelAgentSessionAgents,
    closeAgentSession,
    hasAgentSessionReturnTarget,
    openAgentSession,
    openAgentSessionPubkey,
    openThreadAndCloseAgentSession,
    selectAgentSession,
  };
}
