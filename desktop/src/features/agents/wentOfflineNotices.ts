// "Went offline mid-task": an Agents-inbox notice when one of your agents drops offline while it still had live work.
// Client-side (no relay producer yet): watch your agents' presence and their active turns; an online -> offline
// transition while a turn is live (or ended within a few seconds, since a dying agent's turns get cleared first)
// records a notice. Notices are kept per device in localStorage and merged into the home feed's agent activity.
import * as React from "react";

import {
  getActiveTurnsForAgent,
  subscribeActiveAgentTurns,
} from "@/features/agents/activeAgentTurnsStore";
import { useManagedAgentsQuery } from "@/features/agents/hooks";
import { usePresenceQuery } from "@/features/presence/hooks";
import type { FeedItem } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

export const WENT_OFFLINE_NOTIFY_KIND = "went_offline";
const KEY = "buzz-agent-went-offline-notices.v1";
const EVENT = "buzz-agent-went-offline-notices";
const MAX = 50;
const MAX_AGE_S = 7 * 24 * 3600;
/** A turn that ended this recently still counts as "mid-task" when the agent goes offline. */
const GRACE_MS = 15_000;

export type WentOfflineNotice = {
  id: string;
  agentPubkey: string;
  channelId: string;
  at: number; // unix seconds
};

let cache: WentOfflineNotice[] | null = null;
function read(): WentOfflineNotice[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    const now = Date.now() / 1000;
    cache = Array.isArray(raw)
      ? raw.filter(
          (n): n is WentOfflineNotice =>
            n &&
            typeof n.id === "string" &&
            typeof n.agentPubkey === "string" &&
            typeof n.channelId === "string" &&
            typeof n.at === "number" &&
            now - n.at < MAX_AGE_S,
        )
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function recordWentOfflineNotice(
  agentPubkey: string,
  channelId: string,
  atMs = Date.now(),
): void {
  const at = Math.floor(atMs / 1000);
  const agent = normalizePubkey(agentPubkey);
  const id = `went-offline:${agent}:${channelId}:${at}`;
  const next = [{ id, agentPubkey: agent, channelId, at }, ...read()].slice(
    0,
    MAX,
  );
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* per-device notice only */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useWentOfflineNotices(): WentOfflineNotice[] {
  return React.useSyncExternalStore(
    (cb) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
          cache = null;
          cb();
        }
      };
      window.addEventListener(EVENT, cb);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(EVENT, cb);
        window.removeEventListener("storage", onStorage);
      };
    },
    read,
    () => EMPTY,
  );
}
const EMPTY: WentOfflineNotice[] = [];

/** Notices as agent-activity feed items (tag `agent-notify` = went_offline). */
export function wentOfflineFeedItems(
  notices: readonly WentOfflineNotice[],
): FeedItem[] {
  return notices.map((n) => ({
    id: n.id,
    kind: 9,
    pubkey: n.agentPubkey,
    content: "Went offline while working on a task.",
    createdAt: n.at,
    channelId: n.channelId,
    channelName: "",
    tags: [
      ["agent-notify", WENT_OFFLINE_NOTIFY_KIND],
      ["h", n.channelId],
    ],
    category: "agent_activity",
  }));
}

/** Mount once: watches your agents and records a notice when one goes offline mid-task. */
export function WentOfflineWatcher() {
  const agents = useManagedAgentsQuery().data ?? [];
  const pubkeys = React.useMemo(
    () => agents.map((a) => normalizePubkey(a.pubkey)).sort(),
    [agents],
  );
  const presence = usePresenceQuery(pubkeys, {
    enabled: pubkeys.length > 0,
  }).data;
  // Last time each agent had live turns, and in which channel.
  const lastWorkRef = React.useRef(
    new Map<string, { channelId: string; atMs: number }>(),
  );
  React.useEffect(() => {
    const snap = () => {
      const now = Date.now();
      for (const pk of pubkeys) {
        const turns = getActiveTurnsForAgent(pk);
        if (turns.length > 0) {
          lastWorkRef.current.set(pk, {
            channelId: turns[0].channelId,
            atMs: now,
          });
        }
      }
    };
    snap();
    const unsub = subscribeActiveAgentTurns(snap);
    const t = window.setInterval(snap, 5_000);
    return () => {
      unsub();
      window.clearInterval(t);
    };
  }, [pubkeys]);
  const prevRef = React.useRef(new Map<string, string>());
  React.useEffect(() => {
    if (!presence) return;
    const now = Date.now();
    for (const pk of pubkeys) {
      const status = (presence as Record<string, string | undefined>)[pk];
      if (!status) continue;
      const prev = prevRef.current.get(pk);
      prevRef.current.set(pk, status);
      if (!prev || prev === "offline" || status !== "offline") continue;
      const live = getActiveTurnsForAgent(pk);
      const last = lastWorkRef.current.get(pk);
      const channelId =
        live[0]?.channelId ??
        (last && now - last.atMs <= GRACE_MS ? last.channelId : null);
      if (channelId) {
        recordWentOfflineNotice(pk, channelId, now);
        lastWorkRef.current.delete(pk);
      }
    }
  }, [presence, pubkeys]);
  return null;
}
