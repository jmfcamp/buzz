import * as React from "react";

/**
 * Appearance preference: show numeric counts beside primary left-nav items
 * (Inbox, Browsers, Agents, Bots). Default off — opt-in.
 */
export const SIDEBAR_MENU_COUNTS_STORAGE_KEY =
  "buzz.appearance.showSidebarMenuCounts";

export const DEFAULT_SIDEBAR_MENU_COUNTS_ENABLED = false;

const listeners = new Set<() => void>();
let enabled = readStoredSidebarMenuCountsEnabled();

export function parseSidebarMenuCountsEnabled(
  value: string | null | undefined,
): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  return DEFAULT_SIDEBAR_MENU_COUNTS_ENABLED;
}

function readStoredSidebarMenuCountsEnabled(): boolean {
  try {
    return parseSidebarMenuCountsEnabled(
      globalThis.localStorage?.getItem(SIDEBAR_MENU_COUNTS_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_SIDEBAR_MENU_COUNTS_ENABLED;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSidebarMenuCountsEnabled(): boolean {
  return enabled;
}

export function setSidebarMenuCountsEnabled(next: boolean): void {
  enabled = next;
  try {
    globalThis.localStorage?.setItem(
      SIDEBAR_MENU_COUNTS_STORAGE_KEY,
      next ? "true" : "false",
    );
  } catch {
    // Persistence is best-effort; the in-memory preference still applies.
  }
  for (const listener of listeners) listener();
}

export function useSidebarMenuCountsEnabled(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    getSidebarMenuCountsEnabled,
    () => DEFAULT_SIDEBAR_MENU_COUNTS_ENABLED,
  );
}
