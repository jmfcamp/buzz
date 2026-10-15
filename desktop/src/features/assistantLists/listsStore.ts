// In-memory store for the Assistant lists doc, shared by web and desktop. No relay imports (unit tests import
// this through the desktop Assistant store); listsSync.ts plugs the relay engine in.
import * as React from "react";

import { dueReminderItems, type ListsDoc, markFired } from "./listsDoc";

export const ASSISTANT_LISTS_CHANGED_EVENT = "buzz-assistant-lists-changed";
const nowSec = () => Math.floor(Date.now() / 1000);

/** What listsSync.ts registers while a relay sync runs. */
export type ListsEngine = {
  pk: string;
  doc: ListsDoc;
  update: (next: ListsDoc) => void;
};

let active: ListsEngine | null = null;
let activeRelayUrl = "";
let version = 0;
const listeners = new Set<() => void>();
const startHooks = new Set<(pk: string, relayUrl: string) => void>();

export function emitAssistantListsChanged() {
  version += 1;
  for (const l of listeners) l();
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(ASSISTANT_LISTS_CHANGED_EVENT));
}

export function setActiveListsEngine(
  engine: ListsEngine | null,
  relayUrl = "",
) {
  active = engine;
  activeRelayUrl = relayUrl;
  if (engine) for (const h of startHooks) h(engine.pk, relayUrl);
  emitAssistantListsChanged();
}

export function isActiveListsEngine(engine: ListsEngine) {
  return active === engine;
}

export function subscribeAssistantLists(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Run `fn(pk, relayUrl)` whenever a sync starts (e.g. the desktop's one-time localStorage migration). */
export function onAssistantListsSyncStart(
  fn: (pk: string, relayUrl: string) => void,
) {
  startHooks.add(fn);
  if (active) fn(active.pk, activeRelayUrl);
  return () => void startHooks.delete(fn);
}

/** The doc for `pubkey`, or null when no sync is running for it. */
export function getAssistantListsDoc(
  pubkey: string | undefined,
): ListsDoc | null {
  const pk = pubkey?.trim().toLowerCase();
  return pk && active && active.pk === pk ? active.doc : null;
}

/** Apply a local edit. Returns false when no sync is running for `pubkey`. */
export function updateAssistantLists(
  pubkey: string | undefined,
  fn: (doc: ListsDoc, now: number) => ListsDoc,
): boolean {
  const pk = pubkey?.trim().toLowerCase();
  if (!pk || !active || active.pk !== pk) return false;
  const next = fn(active.doc, nowSec());
  if (next !== active.doc) {
    active.update(next);
    emitAssistantListsChanged();
  }
  return true;
}

export function useAssistantListsDoc(
  pubkey: string | undefined,
): ListsDoc | null {
  React.useSyncExternalStore(
    subscribeAssistantLists,
    () => version,
    () => 0,
  );
  return getAssistantListsDoc(pubkey);
}

/** Re-render every `ms` (due-ness changes with time). */
export function useNowSeconds(ms = 30_000): number {
  const [now, setNow] = React.useState(nowSec);
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(nowSec()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * Desktop wake firer: of `itemIds`, the open due reminders not yet fired for their current due time are marked
 * fired (synced) and returned. Null when no sync is running (callers keep their old behavior).
 */
export function claimReminderFires(
  pubkey: string | undefined,
  itemIds: readonly string[],
): string[] | null {
  const doc = getAssistantListsDoc(pubkey);
  if (!doc) return null;
  const now = nowSec();
  const fresh = itemIds.filter((id) => {
    const e = doc.items[id];
    const i = e?.on ? e.item : undefined;
    return (
      !!i &&
      i.kind === "reminder" &&
      i.status === "open" &&
      i.dueAt != null &&
      i.dueAt <= now &&
      !((e.firedAt ?? 0) >= i.dueAt)
    );
  });
  if (fresh.length > 0)
    updateAssistantLists(pubkey, (d, t) => markFired(d, fresh, t));
  return fresh;
}

/** Open Assistant reminders due now for `pubkey` (web only: the desktop's Assistant shows its own). */
export function useAssistantDueReminderCount(
  pubkey: string | undefined,
): number {
  const doc = useAssistantListsDoc(pubkey);
  const now = useNowSeconds();
  if (
    !doc ||
    (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window)
  )
    return 0;
  return dueReminderItems(doc, now).length;
}
