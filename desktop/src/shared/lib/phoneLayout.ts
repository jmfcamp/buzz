// Phone-only layout switch: viewport narrower than 600px (iPhone-class). iPad (744px+) and desktop never match.
// Sets `data-phone` on <html> so phone styles can be scoped with [data-phone]; usePhoneLayout() for components.
import * as React from "react";

export const PHONE_MAX_WIDTH_PX = 599;
const query = () => `(max-width: ${PHONE_MAX_WIDTH_PX}px)`;

export function isPhoneLayout(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query()).matches;
}

/** Keeps `data-phone` on the root element in sync with the viewport. Call once at startup. */
export function installPhoneLayoutAttribute(): void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
  const mql = window.matchMedia(query());
  const sync = () => {
    if (mql.matches) document.documentElement.setAttribute("data-phone", "");
    else document.documentElement.removeAttribute("data-phone");
  };
  sync();
  mql.addEventListener("change", sync);
  installPhoneViewportHeight(mql);
  installPhoneTouchBehaviors(mql);
  installTabletKeyboardFrame(mql);
}

/** Installed tablet-width app (iPad portrait/landscape, iPhone landscape; the web.css standalone >=600px frame): the
 *  same visual-viewport keyboard handling the phone shell uses, applied to the fixed #root frame. While the keyboard
 *  is up, --tablet-vv-top / --tablet-kb pin the frame to the visible area (so iOS's focus scroll can't push the header
 *  under the status bar); when it closes both reset to 0 and the document scroll snaps back to 0,0, so the layout
 *  returns exactly to the initial one. Rotation re-baselines the keyboard detection. */
function installTabletKeyboardFrame(phoneMql: MediaQueryList): void {
  const vv = window.visualViewport;
  const frameMql = window.matchMedia("(min-width: 600px) and (display-mode: standalone)");
  const root = document.documentElement;
  let maxH = 0;
  let lastW = window.innerWidth;
  const active = () => frameMql.matches && !phoneMql.matches;
  const clear = () => {
    root.style.removeProperty("--tablet-kb");
    root.style.removeProperty("--tablet-vv-top");
    root.removeAttribute("data-tablet-keyboard");
  };
  const resetScroll = () => {
    if (!active()) return;
    if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    for (const el of [document.documentElement, document.body, document.getElementById("root")]) {
      if (el && (el.scrollTop !== 0 || el.scrollLeft !== 0)) {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      }
    }
  };
  const sync = () => {
    if (!active() || !vv) {
      clear();
      return;
    }
    if (window.innerWidth !== lastW) {
      // Rotation: heights change meaning, so forget the old baseline.
      lastW = window.innerWidth;
      maxH = 0;
    }
    maxH = Math.max(maxH, window.innerHeight, vv.height);
    const ae = document.activeElement;
    const fieldFocused =
      ae instanceof HTMLElement && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName));
    const keyboard = fieldFocused && vv.height < maxH - 150;
    if (!keyboard) {
      clear();
      resetScroll();
      resetHiddenAncestors();
      return;
    }
    root.setAttribute("data-tablet-keyboard", "");
    const top = Math.max(0, Math.round(vv.offsetTop));
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    root.style.setProperty("--tablet-vv-top", `${top}px`);
    root.style.setProperty("--tablet-kb", `${kb}px`);
  };
  const later = (...ms: number[]) => {
    for (const m of ms) window.setTimeout(sync, m);
  };
  // iOS reveals a focused field by scrolling the nearest ancestors, including overflow:hidden ones the user can't
  // scroll back (the main content surface around the composer). Remember the field and, once the keyboard is gone,
  // put every non-scrollable ancestor back to scrollTop 0; otherwise the main panel stays shifted up with a gap.
  let lastField: Element | null = null;
  const resetHiddenAncestors = () => {
    for (let el = lastField?.parentElement ?? null; el && el !== document.body; el = el.parentElement) {
      if (el.scrollTop === 0 && el.scrollLeft === 0) continue;
      const cs = getComputedStyle(el);
      const fixedY = cs.overflowY === "hidden" || cs.overflowY === "clip" || cs.overflowY === "visible";
      const fixedX = cs.overflowX === "hidden" || cs.overflowX === "clip" || cs.overflowX === "visible";
      if (fixedY) el.scrollTop = 0;
      if (fixedX) el.scrollLeft = 0;
    }
  };
  const settleClosed = () => {
    if (!active()) return;
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) return;
    // No field focused: the keyboard is down, whatever the viewport heights say.
    clear();
    resetScroll();
    resetHiddenAncestors();
  };
  document.addEventListener(
    "focusin",
    (e) => {
      lastField = e.target instanceof Element ? e.target : null;
      later(0, 100, 300, 600);
    },
    true,
  );
  document.addEventListener(
    "focusout",
    () => {
      for (const m of [50, 300, 600]) window.setTimeout(settleClosed, m);
    },
    true,
  );
  window.addEventListener("scroll", () => (root.hasAttribute("data-tablet-keyboard") ? sync() : resetScroll()), { passive: true });
  vv?.addEventListener("resize", sync);
  vv?.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);
  window.addEventListener("orientationchange", () => later(0, 300, 800));
  frameMql.addEventListener("change", sync);
  phoneMql.addEventListener("change", sync);
  sync();
}

/** iOS: track the visual viewport (shrinks with the soft keyboard) as --phone-vh so the shell and composer stay on
 *  screen; Safari otherwise scrolls the layout viewport and pushes the composer under the keyboard. */
function installPhoneViewportHeight(mql: MediaQueryList): void {
  const vv = window.visualViewport;
  const root = document.documentElement;
  let maxH = 0;
  const sync = () => {
    if (!mql.matches) {
      root.style.removeProperty("--phone-vh");
      root.style.removeProperty("--phone-vv-top");
      root.removeAttribute("data-phone-keyboard");
      return;
    }
    let h = vv ? vv.height : window.innerHeight;
    const standalone = isStandaloneDisplay();
    if (standalone) root.setAttribute("data-phone-standalone", "");
    else root.removeAttribute("data-phone-standalone");
    // The soft keyboard is up when the visual viewport is much shorter than the layout viewport (or than the
    // largest height seen, for engines that resize both).
    maxH = Math.max(maxH, window.innerHeight, h);
    const keyboard = h < maxH - 150;
    if (keyboard) root.setAttribute("data-phone-keyboard", "");
    else root.removeAttribute("data-phone-keyboard");
    // Installed iOS PWA: the visual/inner height can come up short of the full screen (status-bar and home
    // indicator insets subtracted), leaving a dead band under the tab bar. Without the keyboard, use the full height.
    if (standalone && !keyboard) h = Math.max(h, window.innerHeight, maxH);
    root.style.setProperty("--phone-vh", `${Math.round(h)}px`);
    resetDocumentScroll();
    // Safari tab: focusing the composer pans the visual viewport down inside the layout viewport (offsetTop > 0) and
    // scrollTo(0,0) can't undo it. The shell is position:fixed, so pin its top to the visual viewport instead; the
    // composer then sits right above the keyboard with the list filling the space above.
    const top = vv && keyboard ? Math.max(0, Math.round(vv.offsetTop)) : 0;
    root.style.setProperty("--phone-vv-top", `${top}px`);
    // Installed iOS app: with the keyboard up iOS can also scroll the page, and fixed elements then render offset
    // from where top/offsetTop says (the frame showed a band above the header). Measure where the frame really is
    // and correct by the difference, so its top lands on the visible area's top.
    if (keyboard && vv) {
      window.requestAnimationFrame(() => {
        const el = document.getElementById("root");
        if (!el || !root.hasAttribute("data-phone-keyboard")) return;
        const drift = Math.round(el.getBoundingClientRect().top - vv.offsetTop);
        if (Math.abs(drift) >= 2) {
          const cur = parseFloat(root.style.getPropertyValue("--phone-vv-top")) || 0;
          root.style.setProperty("--phone-vv-top", `${cur - drift}px`);
        }
      });
    }
  };
  // iOS scrolls the document (and sometimes #root) to reveal a focused field; the shell is fixed-height, so any
  // leftover offset after the keyboard closes or a route change shows a blank screen. Pin everything back to 0.
  const resetDocumentScroll = () => {
    if (!mql.matches) return;
    if (window.scrollY !== 0 || window.scrollX !== 0 || (vv && vv.offsetTop !== 0)) window.scrollTo(0, 0);
    for (const el of [document.documentElement, document.body, document.getElementById("root")]) {
      if (el && (el.scrollTop !== 0 || el.scrollLeft !== 0)) {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      }
    }
  };
  // Re-sync too: closing a popover (e.g. the reaction picker) drops the keyboard, and the shell must regrow so the
  // composer is back at the bottom of the screen.
  document.addEventListener("focusout", () => { for (const ms of [50, 300]) window.setTimeout(sync, ms); }, true);
  // iOS reveals a focused field by scrolling/panning after focus; re-sync as it settles.
  document.addEventListener("focusin", () => { for (const ms of [0, 100, 300, 600]) window.setTimeout(sync, ms); }, true);
  window.addEventListener("hashchange", () => window.setTimeout(resetDocumentScroll, 0));
  window.addEventListener("scroll", resetDocumentScroll, { passive: true });
  sync();
  vv?.addEventListener("resize", sync);
  vv?.addEventListener("scroll", sync);
  window.addEventListener("resize", sync);
  mql.addEventListener("change", sync);
}

/** Installed web app (iOS "Add to Home Screen" or display-mode: standalone). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches);
}

const ROW_SELECTOR = '[data-testid="message-row"]';
const INTERACTIVE_SELECTOR =
  'a,button,input,textarea,select,label,[contenteditable="true"],[role="button"],[role="menu"],[role="menuitem"],[data-message-action-rail],[data-radix-popper-content-wrapper]';
const OPEN_ATTR = "data-phone-actions-open";

function isEditable(el: Element | null): el is HTMLElement {
  return !!el && (el instanceof HTMLElement) && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName));
}

/** Phone touch: a tap or scroll start in the message list dismisses the keyboard; message actions (hidden on phone)
 *  open for one row on tap or long-press and close on a tap elsewhere. */
function installPhoneTouchBehaviors(mql: MediaQueryList): void {
  let pressTimer: number | undefined;
  let pressStart: { x: number; y: number } | null = null;
  let suppressClick = false;
  const closeAll = (except?: Element | null) => {
    for (const el of document.querySelectorAll(`[${OPEN_ATTR}]`)) if (el !== except) el.removeAttribute(OPEN_ATTR);
  };
  const openRow = (row: Element) => {
    closeAll(row);
    row.setAttribute(OPEN_ATTR, "");
  };
  document.addEventListener(
    "touchstart",
    (event) => {
      if (!mql.matches) return;
      const target = event.target as Element | null;
      if (!target?.closest?.('[data-testid="message-timeline"]')) return;
      if (target.closest('[data-testid="message-composer"],[data-radix-popper-content-wrapper]')) return;
      const active = document.activeElement;
      if (isEditable(active) && !active.contains(target)) active.blur();
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!mql.matches || event.pointerType === "mouse") return;
      const target = event.target as Element | null;
      const row = target?.closest?.(ROW_SELECTOR);
      window.clearTimeout(pressTimer);
      if (!row || target?.closest(INTERACTIVE_SELECTOR)) return;
      pressStart = { x: event.clientX, y: event.clientY };
      pressTimer = window.setTimeout(() => {
        openRow(row);
        suppressClick = true;
        navigator.vibrate?.(10);
      }, 450);
    },
    true,
  );
  const cancelPress = (event: PointerEvent) => {
    if (pressStart && Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) < 10 && event.type === "pointermove") return;
    window.clearTimeout(pressTimer);
    pressStart = null;
  };
  document.addEventListener("pointermove", cancelPress, true);
  document.addEventListener("pointercancel", cancelPress, true);
  document.addEventListener("pointerup", () => window.clearTimeout(pressTimer), true);
  document.addEventListener(
    "click",
    (event) => {
      if (!mql.matches) return;
      if (suppressClick) {
        suppressClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const target = event.target as Element | null;
      // Some timeline click handlers re-focus the composer; a tap in the list keeps the keyboard down.
      if (
        target?.closest?.('[data-testid="message-timeline"]') &&
        !target.closest('[data-testid="message-composer"],[data-radix-popper-content-wrapper]')
      ) {
        window.setTimeout(() => {
          const active = document.activeElement;
          if (isEditable(active) && !active.closest('[data-radix-popper-content-wrapper]')) active.blur();
        }, 0);
      }
      if (target?.closest?.("[data-message-action-rail],[data-radix-popper-content-wrapper]")) return;
      const row = target?.closest?.(ROW_SELECTOR);
      if (row && !target?.closest(INTERACTIVE_SELECTOR)) {
        // A tap on the message body shows its actions (the "N replies" link still opens the thread).
        event.preventDefault();
        event.stopPropagation();
        if (row.hasAttribute(OPEN_ATTR)) row.removeAttribute(OPEN_ATTR);
        else openRow(row);
        return;
      }
      closeAll();
    },
    true,
  );
  document.addEventListener(
    "contextmenu",
    (event) => {
      if (!mql.matches) return;
      const target = event.target as Element | null;
      const row = target?.closest?.(ROW_SELECTOR);
      if (row && !target?.closest("a,img,video")) {
        event.preventDefault();
        openRow(row);
      }
    },
    true,
  );
}

export function usePhoneLayout(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mql = window.matchMedia(query());
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    isPhoneLayout,
    () => false,
  );
}
