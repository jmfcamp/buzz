import * as React from "react";

import {
  isExpandedPrimaryMenuStillAbove,
  isPrimaryMenuScrolledAway,
  isSidebarScrolledToTop,
  readExpandedPrimaryMenuTop,
} from "@/features/sidebar/lib/primaryMenuScrollAway";

/**
 * True once the primary menu block has scrolled fully above the sidebar list.
 * Measures layout, not scrollTop, so padding and pinned rows stay honest.
 * An open Menu holds that state until the in-flow block meets the expanded copy.
 * The top of the list closes the Menu either way.
 */
export function usePrimaryMenuScrollAway(
  scrollRef: React.RefObject<HTMLElement | null>,
  menuRef: React.RefObject<HTMLElement | null>,
): boolean {
  const [away, setAway] = React.useState(false);

  React.useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const menu = menuRef.current;
    if (!scroll || !menu) return;

    const update = () => {
      const flow = menu.getBoundingClientRect();
      const copyTop = readExpandedPrimaryMenuTop(scroll.ownerDocument);
      const next = isSidebarScrolledToTop(scroll.scrollTop)
        ? false
        : copyTop === null
          ? isPrimaryMenuScrolledAway(
              flow.bottom,
              scroll.getBoundingClientRect().top,
            )
          : isExpandedPrimaryMenuStillAbove(flow.top, copyTop);
      setAway((current) => (current === next ? current : next));
    };

    update();
    scroll.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroll);
    observer.observe(menu);
    return () => {
      scroll.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [menuRef, scrollRef]);

  return away;
}
