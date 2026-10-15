import { buildTranscriptState } from "@/features/agents/ui/agentSessionTranscript";
import {
  mergeObserverEventWindows,
  scopeByChannel,
} from "@/features/agents/ui/agentSessionPanelLayout";
import type {
  ObserverEvent,
  TranscriptItem,
} from "@/features/agents/ui/agentSessionTypes";

/**
 * Per-reply turn chrome (duration / tokens / Thought chip) used to rebuild the
 * whole agent+channel transcript once PER AGENT REPLY on every observer frame.
 * A thread with 36 replies from one busy agent rebuilt a ~2000-frame
 * transcript 36x per streamed frame (seconds of main-thread work), which froze
 * typing and scrolling in that one thread. Rows with identical inputs now share
 * one merge + one buildTranscriptState.
 */
export type SharedChannelTranscript = {
  combined: ObserverEvent[];
  items: TranscriptItem[];
};

type ByChannel = Map<string, SharedChannelTranscript>;
const cache = new WeakMap<
  readonly ObserverEvent[],
  WeakMap<readonly ObserverEvent[], ByChannel>
>();

let buildCount = 0;
/** Test hook: number of transcript builds performed by the shared cache. */
export function getSharedTranscriptBuildCount(): number {
  return buildCount;
}

export function getSharedChannelTranscript(
  liveEvents: readonly ObserverEvent[],
  archivedEvents: readonly ObserverEvent[],
  channelId: string | null,
): SharedChannelTranscript {
  let byArchive = cache.get(liveEvents);
  if (!byArchive) {
    byArchive = new WeakMap();
    cache.set(liveEvents, byArchive);
  }
  let byChannel = byArchive.get(archivedEvents);
  if (!byChannel) {
    byChannel = new Map();
    byArchive.set(archivedEvents, byChannel);
  }
  const key = channelId ?? "";
  const hit = byChannel.get(key);
  if (hit) return hit;
  const combined = mergeObserverEventWindows(
    scopeByChannel(liveEvents, channelId),
    archivedEvents,
  );
  buildCount += 1;
  const entry = { combined, items: buildTranscriptState(combined).items };
  byChannel.set(key, entry);
  return entry;
}

/** Recent null-channel live frames near a reply (early turn chunks). */
export function selectNullChannelLive(
  liveEvents: readonly ObserverEvent[],
  channelId: string | null,
  createdAt: number,
): ObserverEvent[] {
  if (channelId == null) return [];
  return liveEvents.filter((event) => {
    if (event.channelId != null) return false;
    if (!event.timestamp) return false;
    const ts = Date.parse(event.timestamp);
    if (!Number.isFinite(ts)) return false;
    return Math.abs(ts / 1000 - createdAt) <= 600;
  });
}

/**
 * Same rows that previously each built their own transcript. Rows with no
 * nearby null-channel frames (almost all of them) share the cached build; only
 * a reply within 10 minutes of a null-channel live frame builds its own.
 */
export function resolveTurnMetaTranscript(
  liveEvents: readonly ObserverEvent[],
  archivedEvents: readonly ObserverEvent[],
  channelId: string | null,
  createdAt: number,
): SharedChannelTranscript {
  const nullChannelLive = selectNullChannelLive(
    liveEvents,
    channelId,
    createdAt,
  );
  if (nullChannelLive.length === 0) {
    return getSharedChannelTranscript(liveEvents, archivedEvents, channelId);
  }
  const combined = mergeObserverEventWindows(
    [...scopeByChannel(liveEvents, channelId), ...nullChannelLive],
    archivedEvents,
  );
  buildCount += 1;
  return { combined, items: buildTranscriptState(combined).items };
}

/**
 * Archive hydration leader per channel. Every agent reply used to run its own
 * owner_p backfill + 10-page (2000-frame) archive decrypt/ingest for the same
 * channel on mount. Only the first mounted row per channel hydrates now; when
 * it unmounts the next row takes over. Followers read the leader's
 * hasOlderArchived.
 */
type LeaderEntry = {
  members: string[];
  hasOlderArchived: boolean;
  listeners: Set<() => void>;
};
const leaders = new Map<string, LeaderEntry>();

function entryFor(channelId: string): LeaderEntry {
  let entry = leaders.get(channelId);
  if (!entry) {
    entry = { members: [], hasOlderArchived: true, listeners: new Set() };
    leaders.set(channelId, entry);
  }
  return entry;
}

function notify(entry: LeaderEntry) {
  for (const listener of [...entry.listeners]) listener();
}

export function joinHydration(channelId: string, memberId: string): void {
  const entry = entryFor(channelId);
  if (!entry.members.includes(memberId)) {
    entry.members.push(memberId);
    notify(entry);
  }
}

export function leaveHydration(channelId: string, memberId: string): void {
  const entry = leaders.get(channelId);
  if (!entry) return;
  const index = entry.members.indexOf(memberId);
  if (index < 0) return;
  entry.members.splice(index, 1);
  if (entry.members.length === 0 && entry.listeners.size === 0) {
    leaders.delete(channelId);
    return;
  }
  notify(entry);
}

export function isHydrationLeader(
  channelId: string | null,
  memberId: string,
): boolean {
  if (!channelId) return false;
  return leaders.get(channelId)?.members[0] === memberId;
}

export function publishHasOlderArchived(
  channelId: string,
  value: boolean,
): void {
  const entry = entryFor(channelId);
  if (entry.hasOlderArchived === value) return;
  entry.hasOlderArchived = value;
  notify(entry);
}

export function readSharedHasOlderArchived(channelId: string | null): boolean {
  if (!channelId) return true;
  return leaders.get(channelId)?.hasOlderArchived ?? true;
}

export function subscribeHydration(
  channelId: string | null,
  listener: () => void,
): () => void {
  if (!channelId) return () => {};
  const entry = entryFor(channelId);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    if (entry.members.length === 0 && entry.listeners.size === 0) {
      leaders.delete(channelId);
    }
  };
}
