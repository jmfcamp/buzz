import * as React from "react";

import {
  INBOX_STATE_APPLIED_EVENT,
  recordInboxState,
} from "@/features/inbox/inboxStateSync";

const DONE_STORAGE_KEY = "buzz-home-feed-done.v1";
const UNREAD_STORAGE_KEY = "buzz-home-feed-unread.v1";
const MAX_ITEMS = 500;

function doneStorageKey(pubkey: string) {
  return `${DONE_STORAGE_KEY}:${pubkey}`;
}

function unreadStorageKey(pubkey: string) {
  return `${UNREAD_STORAGE_KEY}:${pubkey}`;
}

function readStoredIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter((v): v is string => typeof v === "string")
          .slice(-MAX_ITEMS)
      : [];
  } catch {
    return [];
  }
}

function writeStoredIds(key: string, ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(ids.slice(-MAX_ITEMS)));
}

export function useFeedItemState(pubkey: string | undefined) {
  const normalizedPubkey = pubkey?.trim().toLowerCase() ?? "";
  const key = doneStorageKey(normalizedPubkey);

  const [doneIds, setDoneIds] = React.useState<string[]>(() =>
    readStoredIds(key),
  );
  const [unreadIds, setUnreadIds] = React.useState<string[]>(() =>
    readStoredIds(unreadStorageKey(normalizedPubkey)),
  );
  const [loadedPubkey, setLoadedPubkey] = React.useState(normalizedPubkey);

  React.useEffect(() => {
    setDoneIds(readStoredIds(doneStorageKey(normalizedPubkey)));
    setUnreadIds(readStoredIds(unreadStorageKey(normalizedPubkey)));
    setLoadedPubkey(normalizedPubkey);
  }, [normalizedPubkey]);

  React.useEffect(() => {
    if (loadedPubkey !== normalizedPubkey) return;
    writeStoredIds(doneStorageKey(normalizedPubkey), doneIds);
  }, [loadedPubkey, normalizedPubkey, doneIds]);

  React.useEffect(() => {
    if (loadedPubkey !== normalizedPubkey) return;
    writeStoredIds(unreadStorageKey(normalizedPubkey), unreadIds);
  }, [loadedPubkey, normalizedPubkey, unreadIds]);

  // The synced Inbox state doc rewrote this cache: reload it.
  React.useEffect(() => {
    const onApplied = (e: Event) => {
      if ((e as CustomEvent<{ pubkey: string }>).detail?.pubkey !== normalizedPubkey) return;
      setDoneIds(readStoredIds(doneStorageKey(normalizedPubkey)));
      setUnreadIds(readStoredIds(unreadStorageKey(normalizedPubkey)));
    };
    window.addEventListener(INBOX_STATE_APPLIED_EVENT, onApplied);
    return () => window.removeEventListener(INBOX_STATE_APPLIED_EVENT, onApplied);
  }, [normalizedPubkey]);

  const doneSet = React.useMemo(() => new Set(doneIds), [doneIds]);
  const unreadSet = React.useMemo(() => new Set(unreadIds), [unreadIds]);

  const markDone = React.useCallback((id: string) => {
    recordInboxState(normalizedPubkey, "done", id, true);
    recordInboxState(normalizedPubkey, "unread", id, false);
    setDoneIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setUnreadIds((prev) => prev.filter((v) => v !== id));
  }, [normalizedPubkey]);

  const undoDone = React.useCallback((id: string) => {
    recordInboxState(normalizedPubkey, "done", id, false);
    setDoneIds((prev) => prev.filter((v) => v !== id));
  }, [normalizedPubkey]);

  const markUnread = React.useCallback((id: string) => {
    recordInboxState(normalizedPubkey, "done", id, false);
    recordInboxState(normalizedPubkey, "unread", id, true);
    setDoneIds((prev) => prev.filter((v) => v !== id));
    setUnreadIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, [normalizedPubkey]);

  const undoUnread = React.useCallback((id: string) => {
    recordInboxState(normalizedPubkey, "unread", id, false);
    setUnreadIds((prev) => prev.filter((v) => v !== id));
  }, [normalizedPubkey]);

  return { doneSet, markDone, markUnread, undoDone, undoUnread, unreadSet };
}

export type FeedItemState = ReturnType<typeof useFeedItemState>;
