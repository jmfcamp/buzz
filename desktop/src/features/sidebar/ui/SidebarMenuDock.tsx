import { ChevronDown, ChevronRight } from "lucide-react";
import * as React from "react";

import { applySidebarMenuDockWheel } from "@/features/sidebar/lib/primaryMenuScrollAway";

/** Clears the collapsed Menu row (`h-8`) plus its bottom border. */
export const SIDEBAR_MENU_DOCK_UNREAD_TOP_CLASS = "top-9";

function remeasurePrimaryMenu(scroll: HTMLElement | null) {
  const view = scroll?.ownerDocument.defaultView;
  if (!scroll || !view) return;
  scroll.dispatchEvent(new view.Event("scroll"));
}

export const SIDEBAR_MENU_DOCK_PANEL_ID = "sidebar-menu-dock-panel";

/**
 * Anchored Menu row under search. Overlay, so showing it does not shrink
 * the scrollport and pull the real menu back into view.
 * Buzz and glass themes clear `bg-sidebar` unless `data-buzz-flat` is set.
 * The row and the expanded list keep that fill so the scrolling menu
 * cannot show through. Agent and member status dots are `z-20` and use a
 * 3D transform, so they paint over an equal layer. This row sits above them.
 */
export function SidebarMenuDock({
  away,
  renderMenu,
  scrollRef,
}: {
  away: boolean;
  renderMenu: (collapse: () => void) => React.ReactNode;
  scrollRef: React.RefObject<HTMLElement | null>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [trackedAway, setTrackedAway] = React.useState(away);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const toggleRef = React.useRef<HTMLButtonElement>(null);

  if (away !== trackedAway) {
    setTrackedAway(away);
    if (!away) setExpanded(false);
  }

  // Remeasure when the copy opens or closes. The listener reads the document.
  // biome-ignore lint/correctness/useExhaustiveDependencies: expanded remounts the copy
  React.useLayoutEffect(() => {
    remeasurePrimaryMenu(scrollRef.current);
  }, [expanded, scrollRef]);

  React.useEffect(() => {
    const node = rootRef.current;
    const scroll = scrollRef.current;
    if (!away || !node || !scroll) return;
    const onWheel = (event: WheelEvent) => {
      const panel = node.querySelector<HTMLElement>(
        "[data-sidebar-menu-dock-panel]",
      );
      applySidebarMenuDockWheel(event, scroll, panel);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !expanded) return;
      event.stopPropagation();
      setExpanded(false);
      toggleRef.current?.focus();
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("wheel", onWheel);
      node.removeEventListener("keydown", onKeyDown);
    };
  }, [away, expanded, scrollRef]);

  if (!away) return null;

  const collapse = () => setExpanded(false);

  return (
    <div
      className="absolute inset-x-0 top-0 z-30 isolate flex max-h-full flex-col border-b border-sidebar-border bg-sidebar"
      data-buzz-flat
      data-testid="sidebar-menu-dock"
      ref={rootRef}
    >
      <div className="shrink-0 px-[3px]">
        <div className="px-2">
          <button
            aria-controls={SIDEBAR_MENU_DOCK_PANEL_ID}
            aria-expanded={expanded}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-sidebar-foreground outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
            data-testid="sidebar-menu-dock-toggle"
            onClick={() => setExpanded((current) => !current)}
            ref={toggleRef}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">Menu</span>
            {expanded ? (
              <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
            )}
          </button>
        </div>
      </div>
      {expanded ? (
        <div
          className="min-h-0 overflow-y-auto bg-sidebar px-[3px]"
          data-buzz-flat
          data-sidebar-menu-dock-panel=""
          data-testid="sidebar-menu-dock-panel"
          id={SIDEBAR_MENU_DOCK_PANEL_ID}
          onScroll={() => {
            remeasurePrimaryMenu(scrollRef.current);
          }}
        >
          {renderMenu(collapse)}
        </div>
      ) : null}
    </div>
  );
}
