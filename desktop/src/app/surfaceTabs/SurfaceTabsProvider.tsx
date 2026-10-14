import * as React from "react";

import { openWebPinExternally, pinsOpenExternally } from "@/features/pinned-sites/lib/webPinOpen";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import {
  type SurfaceTab,
  type SurfaceTabTarget,
  insertSurfaceTab,
  readStoredSurfaceTabs,
  shouldLeaveTabForSidebarClick,
  surfaceTabShortcutIndex,
  surfaceTabsStorageKey,
  surfaceTabsWithThreadLabel,
  surfaceTabsWithoutThread,
  surfaceTabKey,
} from "@/app/surfaceTabs/surfaceTabModel";
import {
  SURFACE_TABS_LANE,
  projectSurfaceTabs,
  seedSurfaceTabs,
  surfaceTabEdits,
  withStableTabIds,
} from "@/app/surfaceTabs/surfaceTabSync";
import { useLaneSync } from "@/features/sidebar/lib/sidebarLaneReconciler";
import { isEmptyTree } from "@/features/sidebar/lib/sidebarLwwMap";
import { parkPlaygroundHost } from "@/features/playground/lib/sessions";
import {
  leaveLeftNavBuzzTerm,
  openTerminalPanel,
} from "@/features/terminal/terminalPanelStore";
import { hasPrimaryShortcutModifier } from "@/shared/lib/platform";
import { getStorageItem, setStorageItem } from "@/shared/lib/safeStorage";
import { useSidebar } from "@/shared/ui/sidebar";

type SurfaceTabsContextValue = {
  tabs: SurfaceTab[];
  activeId: string | null;
  /** activate:false adds (or refreshes) the tab without navigating to it (phone Me long-press). */
  addTab: (
    input: { label: string; target: SurfaceTabTarget },
    options?: { activate?: boolean },
  ) => void;
  selectTab: (id: string) => void;
  closeTab: (id: string) => void;
  /** Remove a starred-thread tab. The open thread stays on its route. */
  closeThreadTabs: (input: { channelId?: string; rootId: string }) => void;
  /** Rename a starred-thread tab. The open tab stays selected. */
  renameThreadTab: (input: {
    channelId?: string;
    label: string;
    rootId: string;
  }) => void;
  /** Leave fullscreen tabs and restore the sidebar from before the tab. */
  showNormalLayout: () => void;
  registerAssistantOpener: (open: () => void) => () => void;
};

const SurfaceTabsContext = React.createContext<SurfaceTabsContextValue | null>(
  null,
);

/** Tab strip state. Throws when the top chrome is mounted outside the provider. */
export function useSurfaceTabs(): SurfaceTabsContextValue {
  const context = React.useContext(SurfaceTabsContext);
  if (!context) {
    throw new Error("useSurfaceTabs must be used within SurfaceTabsProvider.");
  }
  return context;
}

/** Tab strip state when the provider may be absent. */
export function useOptionalSurfaceTabs(): SurfaceTabsContextValue | null {
  return React.useContext(SurfaceTabsContext);
}

/**
 * Register the Assistant row's open action so an Assistant tab can reuse it.
 */
export function useRegisterAssistantTabOpener(open: () => void): void {
  const tabs = useOptionalSurfaceTabs();
  const openRef = React.useRef(open);
  openRef.current = open;

  React.useEffect(() => {
    if (!tabs) return;
    return tabs.registerAssistantOpener(() => {
      openRef.current();
    });
  }, [tabs]);
}

function readTabs(communityId: string): SurfaceTab[] {
  return withStableTabIds(
    readStoredSurfaceTabs(getStorageItem(surfaceTabsStorageKey(communityId))),
  );
}

function openTarget(
  target: SurfaceTabTarget,
  navigation: ReturnType<typeof useAppNavigation>,
  openAssistant: (() => void) | undefined,
): void {
  switch (target.kind) {
    case "buzz-term":
      openTerminalPanel("maximized", "all");
      parkPlaygroundHost();
      return;
    case "assistant":
      openAssistant?.();
      return;
    case "home":
      parkPlaygroundHost();
      leaveLeftNavBuzzTerm();
      void navigation.goHome();
      return;
    case "pulse":
      parkPlaygroundHost();
      leaveLeftNavBuzzTerm();
      void navigation.goPulse();
      return;
    case "projects":
      parkPlaygroundHost();
      leaveLeftNavBuzzTerm();
      void navigation.goProjects();
      return;
    case "project":
      parkPlaygroundHost();
      leaveLeftNavBuzzTerm();
      void navigation.goProject(target.projectId);
      return;
    case "agents":
      parkPlaygroundHost();
      leaveLeftNavBuzzTerm();
      void navigation.goAgents();
      return;
    case "bots":
      parkPlaygroundHost();
      leaveLeftNavBuzzTerm();
      void navigation.goBots();
      return;
    case "browsers":
      parkPlaygroundHost();
      leaveLeftNavBuzzTerm();
      void navigation.goBrowsers();
      return;
    case "workflows":
      parkPlaygroundHost();
      leaveLeftNavBuzzTerm();
      void navigation.goWorkflows();
      return;
    case "pin":
      parkPlaygroundHost();
      leaveLeftNavBuzzTerm();
      void navigation.goPinnedSite(target.pinId);
      return;
    case "channel":
      parkPlaygroundHost();
      leaveLeftNavBuzzTerm();
      void navigation.goChannel(target.channelId);
      return;
    case "thread":
      parkPlaygroundHost();
      leaveLeftNavBuzzTerm();
      void navigation.goChannel(target.channelId, { thread: target.rootId });
      return;
    default: {
      const unreachable: never = target;
      void unreachable;
    }
  }
}

/**
 * Chrome tabs for existing Buzz surfaces. Must sit inside `SidebarProvider`.
 * Entering a tab collapses the left panel. Home restores the panel state
 * from before the first tab in this visit.
 */
export function SurfaceTabsProvider({
  children,
  communityId,
  pubkey,
  relayUrl,
}: {
  children: React.ReactNode;
  communityId: string;
  /** With both set, tabs sync across devices (see surfaceTabSync.ts). */
  pubkey?: string;
  relayUrl?: string;
}) {
  const sidebar = useSidebar();
  const navigation = useAppNavigation();
  const [scopedCommunityId, setScopedCommunityId] = React.useState(communityId);
  const [tabs, setTabs] = React.useState(() => readTabs(communityId));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const tabsRef = React.useRef(tabs);
  const activeIdRef = React.useRef(activeId);
  const openRef = React.useRef(sidebar.open);
  const savedOpenRef = React.useRef<boolean | null>(null);
  const navigationRef = React.useRef(navigation);
  const assistantOpenerRef = React.useRef<(() => void) | null>(null);
  const sidebarSetOpenRef = React.useRef(sidebar.setOpen);

  tabsRef.current = tabs;
  activeIdRef.current = activeId;
  openRef.current = sidebar.open;
  navigationRef.current = navigation;
  sidebarSetOpenRef.current = sidebar.setOpen;
  const { tree: syncTree, edit: editSync } = useLaneSync(
    SURFACE_TABS_LANE,
    pubkey,
    relayUrl,
  );
  const syncOn = Boolean(pubkey && relayUrl);
  const syncOnRef = React.useRef(syncOn);
  syncOnRef.current = syncOn;
  const editSyncRef = React.useRef(editSync);
  editSyncRef.current = editSync;
  /** Single write path: local state, plus synced registers when sync is on. */
  const commitTabs = React.useCallback((next: SurfaceTab[]) => {
    const prev = tabsRef.current;
    tabsRef.current = next;
    setTabs(next);
    if (syncOnRef.current)
      editSyncRef.current((tree) => surfaceTabEdits(tree, prev, next));
  }, []);

  if (scopedCommunityId !== communityId) {
    const nextTabs = readTabs(communityId);
    setScopedCommunityId(communityId);
    setTabs(nextTabs);
    setActiveId(null);
    tabsRef.current = nextTabs;
    activeIdRef.current = null;
    savedOpenRef.current = null;
  }

  const showNormalLayout = React.useCallback(() => {
    const restore = savedOpenRef.current;
    savedOpenRef.current = null;
    activeIdRef.current = null;
    setActiveId(null);
    if (restore !== null) sidebarSetOpenRef.current(restore);
  }, []);

  const leaveTabForSidebarClick = React.useCallback(() => {
    if (activeIdRef.current === null) return;
    savedOpenRef.current = null;
    activeIdRef.current = null;
    setActiveId(null);
  }, []);

  const activate = React.useCallback((id: string, target: SurfaceTabTarget) => {
    // Web: a pinned-site tab is a launcher; it opens the site externally and never becomes the active surface.
    if (target.kind === "pin" && pinsOpenExternally(target.pinId)) {
      openWebPinExternally(target.pinId);
      return;
    }
    if (activeIdRef.current === null) {
      savedOpenRef.current = openRef.current;
    }
    activeIdRef.current = id;
    setActiveId(id);
    sidebarSetOpenRef.current(false);
    openTarget(
      target,
      navigationRef.current,
      assistantOpenerRef.current ?? undefined,
    );
  }, []);

  const addTab = React.useCallback(
    (
      input: { label: string; target: SurfaceTabTarget },
      options?: { activate?: boolean },
    ) => {
      const result = insertSurfaceTab(tabsRef.current, input, () =>
        surfaceTabKey(input.target),
      );
      commitTabs(result.tabs);
      // Web: adding a pinned-site tab never opens the site; the tab is a launcher.
      const webPin = input.target.kind === "pin" && pinsOpenExternally(input.target.pinId);
      if (result.id && options?.activate !== false && !webPin)
        activate(result.id, input.target);
    },
    [activate, commitTabs],
  );

  const selectTab = React.useCallback(
    (id: string) => {
      const tab = tabsRef.current.find((item) => item.id === id);
      if (!tab) return;
      activate(tab.id, tab.target);
    },
    [activate],
  );

  const closeTab = React.useCallback(
    (id: string) => {
      const next = tabsRef.current.filter((tab) => tab.id !== id);
      commitTabs(next);
      if (activeIdRef.current === id) showNormalLayout();
    },
    [commitTabs, showNormalLayout],
  );

  const closeThreadTabs = React.useCallback(
    (input: { channelId?: string; rootId: string }) => {
      const result = surfaceTabsWithoutThread(tabsRef.current, input);
      if (result.removedIds.length === 0) return;
      commitTabs([...result.tabs]);
      const activeId = activeIdRef.current;
      if (activeId && result.removedIds.includes(activeId)) {
        showNormalLayout();
      }
    },
    [commitTabs, showNormalLayout],
  );

  const renameThreadTab = React.useCallback(
    (input: { channelId?: string; label: string; rootId: string }) => {
      const result = surfaceTabsWithThreadLabel(tabsRef.current, input);
      if (!result.changed) return;
      commitTabs([...result.tabs]);
    },
    [commitTabs],
  );

  const registerAssistantOpener = React.useCallback((open: () => void) => {
    assistantOpenerRef.current = open;
    return () => {
      if (assistantOpenerRef.current === open) {
        assistantOpenerRef.current = null;
      }
    };
  }, []);

  // Remote edits (or the cached synced doc) replace the local strip.
  React.useEffect(() => {
    if (!syncOn || isEmptyTree(syncTree)) return;
    const next = projectSurfaceTabs(syncTree);
    const same =
      next.length === tabsRef.current.length &&
      next.every(
        (tab, i) =>
          tab.id === tabsRef.current[i]?.id &&
          tab.label === tabsRef.current[i]?.label,
      );
    if (same) return;
    tabsRef.current = next;
    setTabs(next);
    const active = activeIdRef.current;
    if (active && !next.some((tab) => tab.id === active)) showNormalLayout();
  }, [syncOn, syncTree, showNormalLayout]);

  // Seed this device's existing tabs once, after the relay head has had a
  // moment to land so remote tombstones are seen first (no resurrection).
  const seededRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!pubkey || !relayUrl) return;
    const scope = `${pubkey}|${relayUrl}`;
    if (seededRef.current === scope) return;
    const timer = setTimeout(() => {
      seededRef.current = scope;
      const local = tabsRef.current;
      if (local.length > 0)
        editSyncRef.current((tree) => seedSurfaceTabs(tree, local));
    }, 4_000);
    return () => clearTimeout(timer);
  }, [pubkey, relayUrl]);

  React.useEffect(() => {
    setStorageItem(surfaceTabsStorageKey(communityId), JSON.stringify(tabs));
  }, [communityId, tabs]);

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (activeIdRef.current === null) return;
      if (!shouldLeaveTabForSidebarClick(event)) return;
      const target = event.target;
      const element =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null;
      if (!element?.closest("[data-testid='app-sidebar']")) return;
      leaveTabForSidebarClick();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [leaveTabForSidebarClick]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.shiftKey ||
        !hasPrimaryShortcutModifier(event)
      ) {
        return;
      }
      if (event.key === "`" || event.code === "Backquote") {
        event.preventDefault();
        showNormalLayout();
        return;
      }
      if (event.key === "F4") {
        const currentId = activeIdRef.current;
        if (!currentId) return;
        event.preventDefault();
        closeTab(currentId);
        return;
      }
      const index = surfaceTabShortcutIndex(event.key, tabsRef.current.length);
      if (index === null) return;
      const tab = tabsRef.current[index];
      if (!tab) return;
      event.preventDefault();
      activate(tab.id, tab.target);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activate, closeTab, showNormalLayout]);

  const value = React.useMemo<SurfaceTabsContextValue>(
    () => ({
      tabs,
      activeId,
      addTab,
      selectTab,
      closeTab,
      closeThreadTabs,
      renameThreadTab,
      showNormalLayout,
      registerAssistantOpener,
    }),
    [
      tabs,
      activeId,
      addTab,
      selectTab,
      closeTab,
      closeThreadTabs,
      renameThreadTab,
      showNormalLayout,
      registerAssistantOpener,
    ],
  );

  return (
    <SurfaceTabsContext.Provider value={value}>
      {children}
    </SurfaceTabsContext.Provider>
  );
}
