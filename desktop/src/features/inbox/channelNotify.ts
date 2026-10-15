// Per-channel notification level, synced in the inbox-state doc (kind 30078,
// d=buzz:inbox-state). Stored as `ch:<channelId>` ids in existing lanes so
// older clients keep (not drop) them when they republish:
//   followed lane on  -> "all"   (All messages: new channel posts land in Inbox)
//   muted lane on     -> "mute"  (hidden from Inbox except direct @you)
//   neither           -> "mentions" (default)
import * as React from "react";

import type { InboxStateDoc } from "./inboxStateDoc";

export type ChannelNotifyMode = "all" | "mentions" | "mute";
export type ChannelNotifySets = {
  all: ReadonlySet<string>;
  muted: ReadonlySet<string>;
};

export const CHANNEL_NOTIFY_PREFIX = "ch:";
export const CHANNEL_NOTIFY_CHANGED_EVENT = "buzz-channel-notify-changed";
const cacheKey = (pk: string) => `buzz-channel-notify.v1:${pk}`;

export function channelNotifyId(channelId: string) {
  return `${CHANNEL_NOTIFY_PREFIX}${channelId}`;
}
export function isChannelNotifyId(id: string) {
  return id.startsWith(CHANNEL_NOTIFY_PREFIX);
}

export function channelNotifyFromDoc(doc: InboxStateDoc): ChannelNotifySets {
  const pick = (lane: "followed" | "muted") =>
    new Set(
      Object.entries(doc.lanes[lane])
        .filter(([id, e]) => e.on && isChannelNotifyId(id))
        .map(([id]) => id.slice(CHANNEL_NOTIFY_PREFIX.length)),
    );
  const all = pick("followed");
  const muted = pick("muted");
  // Both on can only come from a concurrent edit: mute wins (conservative).
  for (const id of muted) all.delete(id);
  return { all, muted };
}

export function channelNotifyMode(
  sets: ChannelNotifySets,
  channelId: string,
): ChannelNotifyMode {
  if (sets.muted.has(channelId)) return "mute";
  if (sets.all.has(channelId)) return "all";
  return "mentions";
}

const EMPTY: ChannelNotifySets = { all: new Set(), muted: new Set() };

export function readChannelNotifyCache(pk: string): ChannelNotifySets {
  try {
    const raw = window.localStorage.getItem(cacheKey(pk));
    const j = raw ? JSON.parse(raw) : null;
    const arr = (v: unknown) =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : [];
    return { all: new Set(arr(j?.all)), muted: new Set(arr(j?.muted)) };
  } catch {
    return EMPTY;
  }
}

export function writeChannelNotifyCache(pk: string, sets: ChannelNotifySets) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      cacheKey(pk),
      JSON.stringify({ all: [...sets.all], muted: [...sets.muted] }),
    );
  } catch {
    /* quota */
  }
  window.dispatchEvent(
    new CustomEvent(CHANNEL_NOTIFY_CHANGED_EVENT, { detail: { pubkey: pk } }),
  );
}

/** Lanes to write for a mode: [followed(all), muted]. */
export function channelNotifyLaneValues(mode: ChannelNotifyMode) {
  return { followed: mode === "all", muted: mode === "mute" };
}

export function useChannelNotifySets(
  pubkey: string | undefined,
): ChannelNotifySets {
  const pk = pubkey?.trim().toLowerCase() ?? "";
  const [sets, setSets] = React.useState<ChannelNotifySets>(() =>
    pk ? readChannelNotifyCache(pk) : EMPTY,
  );
  React.useEffect(() => {
    if (!pk) {
      setSets(EMPTY);
      return;
    }
    setSets(readChannelNotifyCache(pk));
    const onChange = () => setSets(readChannelNotifyCache(pk));
    window.addEventListener(CHANNEL_NOTIFY_CHANGED_EVENT, onChange);
    return () =>
      window.removeEventListener(CHANNEL_NOTIFY_CHANGED_EVENT, onChange);
  }, [pk]);
  return sets;
}
