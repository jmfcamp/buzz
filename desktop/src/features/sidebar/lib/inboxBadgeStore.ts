import * as React from "react";

import { useInboxTabCounts } from "./useSidebarInboxUnreadCount";

// Total Inbox items (all three tabs) for the app icon / Home Screen badge.
let total: number | undefined;
const listeners = new Set<() => void>();

function setInboxBadgeTotal(next: number | undefined) {
  if (next === total) return;
  total = next;
  for (const listener of listeners) listener();
}

export function useInboxBadgeTotal(): number | undefined {
  return React.useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => total,
    () => total,
  );
}

/** Mounted inside AppShellProvider: publishes the shared Inbox total for the app badge. */
export function InboxBadgeSync() {
  const counts = useInboxTabCounts();
  React.useEffect(() => {
    setInboxBadgeTotal(counts?.total);
  }, [counts?.total]);
  return null;
}
