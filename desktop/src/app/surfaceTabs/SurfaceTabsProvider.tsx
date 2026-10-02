import * as React from "react";

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
} from "@/app/surfaceTabs/surfaceTabModel";
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
  addTab: (input: { label: string; target: SurfaceTabTarget }) => void;
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
  return readStoredSurfaceTabs(
    getStorageItem(surfaceTabsStorageKey(communityId)),
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
}: {
  children: React.ReactNode;
  communityId: string;
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
    (input: { label: string; target: SurfaceTabTarget }) => {
      const result = insertSurfaceTab(tabsRef.current, input);
      tabsRef.current = result.tabs;
      setTabs(result.tabs);
      if (result.id) activate(result.id, input.target);
    },
    [activate],
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
      tabsRef.current = next;
      setTabs(next);
      if (activeIdRef.current === id) showNormalLayout();
    },
    [showNormalLayout],
  );

  const closeThreadTabs = React.useCallback(
    (input: { channelId?: string; rootId: string }) => {
      const result = surfaceTabsWithoutThread(tabsRef.current, input);
      if (result.removedIds.length === 0) return;
      const next = [...result.tabs];
      tabsRef.current = next;
      setTabs(next);
      const activeId = activeIdRef.current;
      if (activeId && result.removedIds.includes(activeId)) {
        showNormalLayout();
      }
    },
    [showNormalLayout],
  );

  const renameThreadTab = React.useCallback(
    (input: { channelId?: string; label: string; rootId: string }) => {
      const result = surfaceTabsWithThreadLabel(tabsRef.current, input);
      if (!result.changed) return;
      const next = [...result.tabs];
      tabsRef.current = next;
      setTabs(next);
    },
    [],
  );

  const registerAssistantOpener = React.useCallback((open: () => void) => {
    assistantOpenerRef.current = open;
    return () => {
      if (assistantOpenerRef.current === open) {
        assistantOpenerRef.current = null;
      }
    };
  }, []);

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
