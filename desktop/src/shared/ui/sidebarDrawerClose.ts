// Slide-in left nav (the Sheet the sidebar becomes on phones / narrow windows): which taps close it.
//
// A nav row (Inbox, Projects, Agents, Bots, Browsers, Buzz term, Porthole, channels, DMs, threads, pinned sites…)
// navigates and closes the drawer, including the row you're already on. Anything that opens something in place
// keeps it open: menus (aria-haspopup), disclosure toggles (aria-expanded), row "+"/"⋯" actions, text fields.
// Navigations that start elsewhere in the drawer (a search result, a footer menu item) close it by route change.

const NAV_TARGET =
  'a[href], [data-sidebar="menu-button"], [data-sidebar="menu-sub-button"]';
const KEEP_OPEN =
  '[aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded], [data-sidebar="menu-action"], [data-sidebar="group-action"], [data-sidebar="group-label"], [data-drawer-keep-open], input, textarea, select, [contenteditable="true"]';

export function shouldCloseDrawerOnTap(
  target: EventTarget | null,
  root: Element,
): boolean {
  const el =
    target && typeof (target as Element).closest === "function"
      ? (target as Element)
      : null;
  if (!el || !root.contains(el)) return false;
  const keep = el.closest(KEEP_OPEN);
  if (keep && root.contains(keep)) {
    // A keep-open control wrapping the nav target (or the target itself).
    const nav = el.closest(NAV_TARGET);
    if (!nav || keep === nav || nav.contains(keep)) return false;
  }
  const nav = el.closest(NAV_TARGET);
  if (!nav || !root.contains(nav)) return false;
  if (
    nav.getAttribute("aria-disabled") === "true" ||
    nav.hasAttribute("disabled")
  )
    return false;
  return true;
}

/** Horizontal swipe toward the drawer's edge (left drawer: leftward) that should dismiss it. */
export function isDrawerDismissSwipe(
  dx: number,
  dy: number,
  side: "left" | "right" = "left",
): boolean {
  const toward = side === "left" ? -dx : dx;
  return toward >= 56 && Math.abs(dy) < toward * 0.75;
}
