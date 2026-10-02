import type { AppSidebarPrimaryMenuProps } from "@/features/sidebar/ui/AppSidebarPinnedHeader";

const MENU_DOCK_EDGE_PX = 1;

/** Close the anchored menu before the same navigation the in-flow rows use. */
export function withCollapsedPrimaryMenu(
  props: AppSidebarPrimaryMenuProps,
  collapse: () => void,
): AppSidebarPrimaryMenuProps {
  return {
    ...props,
    onSelectAgents: () => {
      collapse();
      props.onSelectAgents();
    },
    onSelectBrowsers: () => {
      collapse();
      props.onSelectBrowsers();
    },
    onSelectBots: () => {
      collapse();
      props.onSelectBots();
    },
    onSelectHome: () => {
      collapse();
      props.onSelectHome();
    },
    onSelectPinnedSite: (pinId: string) => {
      collapse();
      props.onSelectPinnedSite(pinId);
    },
    onSelectProjects: () => {
      collapse();
      props.onSelectProjects();
    },
    onSelectPulse: () => {
      collapse();
      props.onSelectPulse();
    },
    onSelectWorkflows: () => {
      collapse();
      props.onSelectWorkflows();
    },
  };
}

/**
 * The primary menu has left the scrollport when its bottom is at or above
 * the scrollport top. One pixel of slop absorbs subpixel rounding.
 */
export function isPrimaryMenuScrolledAway(
  menuBottom: number,
  scrollRootTop: number,
): boolean {
  return menuBottom <= scrollRootTop + MENU_DOCK_EDGE_PX;
}

/**
 * While the anchored menu is open, keep it until the in-flow menu has slid
 * down to the expanded copy. Both values are viewport tops of the same block.
 * The dock stays while the in-flow block is still above that copy.
 */
export function isExpandedPrimaryMenuStillAbove(
  flowTop: number,
  copyTop: number,
): boolean {
  return flowTop < copyTop - MENU_DOCK_EDGE_PX;
}

/**
 * The sidebar list is at its top. The anchored menu closes, open or shut.
 * One pixel of slop matches the other dock edges.
 */
export function isSidebarScrolledToTop(scrollTop: number): boolean {
  return scrollTop <= MENU_DOCK_EDGE_PX;
}

/** Viewport top of the open dock's menu block, or null when the dock is shut. */
export function readExpandedPrimaryMenuTop(
  doc: Document = document,
): number | null {
  const panel = doc.getElementById("sidebar-menu-dock-panel");
  const copy = panel?.querySelector("[data-testid='sidebar-menu-dock-rows']");
  if (!(copy instanceof HTMLElement)) return null;
  return copy.getBoundingClientRect().top;
}

/**
 * Wheel events on the anchored menu never hit the sidebar scroller.
 * Scroll an expanded panel until its edge, then move the sidebar.
 */
export function applySidebarMenuDockWheel(
  event: Pick<WheelEvent, "deltaY" | "preventDefault" | "target">,
  scroll: { scrollTop: number },
  panel: {
    clientHeight: number;
    contains: (node: Node) => boolean;
    scrollHeight: number;
    scrollTop: number;
  } | null,
): void {
  if (event.deltaY === 0) return;
  const target = event.target;
  if (
    panel &&
    typeof Node !== "undefined" &&
    target instanceof Node &&
    panel.contains(target) &&
    panel.scrollHeight > panel.clientHeight + MENU_DOCK_EDGE_PX
  ) {
    const maxScroll = panel.scrollHeight - panel.clientHeight;
    const next = Math.min(
      maxScroll,
      Math.max(0, panel.scrollTop + event.deltaY),
    );
    if (next !== panel.scrollTop) {
      panel.scrollTop = next;
      event.preventDefault();
      return;
    }
  }
  scroll.scrollTop += event.deltaY;
  event.preventDefault();
}
