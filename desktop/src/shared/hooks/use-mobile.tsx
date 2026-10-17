import * as React from "react";

import { AUXILIARY_PANEL_SINGLE_COLUMN_BREAKPOINT_PX } from "@/shared/layout/AuxiliaryPanel";

const MOBILE_BREAKPOINT = 768;

/**
 * Returns `true` when the viewport is narrower than `breakpointPx`.
 * Uses `matchMedia` for efficient change detection.
 */
export function useMediaBreakpoint(breakpointPx: number): boolean {
  const [isBelow, setIsBelow] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpointPx : false,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const onChange = () => {
      setIsBelow(window.innerWidth < breakpointPx);
    };
    mql.addEventListener("change", onChange);
    setIsBelow(window.innerWidth < breakpointPx);
    return () => mql.removeEventListener("change", onChange);
  }, [breakpointPx]);

  return isBelow;
}

export function useElementWidthBreakpoint<T extends HTMLElement>(
  breakpointPx: number,
): [React.RefObject<T | null>, boolean] {
  const [ref, widthPx] = useElementWidth<T>();

  return [ref, widthPx > 0 && widthPx < breakpointPx];
}

export function useElementWidth<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number,
] {
  const ref = React.useRef<T>(null);
  const [widthPx, setWidthPx] = React.useState(0);

  React.useEffect(() => {
    let frameId: number | null = null;
    let cleanup: (() => void) | null = null;

    const attach = () => {
      const element = ref.current;
      if (!element) {
        frameId = window.requestAnimationFrame(attach);
        return;
      }

      const updateWidth = () => {
        setWidthPx(element.getBoundingClientRect().width);
      };

      updateWidth();

      if (typeof ResizeObserver === "undefined") {
        window.addEventListener("resize", updateWidth);
        cleanup = () => window.removeEventListener("resize", updateWidth);
        return;
      }

      const observer = new ResizeObserver(updateWidth);
      observer.observe(element);
      cleanup = () => observer.disconnect();
    };

    attach();

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      cleanup?.();
    };
  }, []);

  return [ref, widthPx];
}

export function useIsMobile() {
  return useMediaBreakpoint(MOBILE_BREAKPOINT);
}

/** Phone-class touch screens: coarse pointer and a short side under 600px (any iPhone, either orientation). */
export const PHONE_SHORT_SIDE_MAX_PX = 599;

/**
 * Whether the left nav is a slide-in drawer (vs. the inline desktop/tablet sidebar). Narrow windows (< 768px) as
 * before, plus every phone-class touch screen whatever its width: iPhone landscape is 667–932px wide, which used to
 * straddle the 768px breakpoint, so the same phone got a drawer in one orientation/zoom and the inline sidebar in
 * another. Mouse/trackpad layouts (fine pointer) and iPads (short side >= 744px) keep the width rule.
 */
export function isSidebarDrawerViewport({
  coarse,
  height,
  width,
}: {
  coarse: boolean;
  height: number;
  width: number;
}): boolean {
  if (width < MOBILE_BREAKPOINT) return true;
  return coarse && Math.min(width, height) <= PHONE_SHORT_SIDE_MAX_PX;
}

function readSidebarDrawerViewport(): boolean {
  if (typeof window === "undefined") return false;
  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  return isSidebarDrawerViewport({
    coarse,
    height: window.innerHeight,
    width: window.innerWidth,
  });
}

export function useSidebarDrawerMode(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("resize", cb);
      window.addEventListener("orientationchange", cb);
      const coarse =
        typeof window.matchMedia === "function"
          ? window.matchMedia("(pointer: coarse)")
          : null;
      coarse?.addEventListener?.("change", cb);
      return () => {
        window.removeEventListener("resize", cb);
        window.removeEventListener("orientationchange", cb);
        coarse?.removeEventListener?.("change", cb);
      };
    },
    readSidebarDrawerViewport,
    () => false,
  );
}

export function useIsAuxiliaryPanelOverlay() {
  return useMediaBreakpoint(AUXILIARY_PANEL_SINGLE_COLUMN_BREAKPOINT_PX);
}

export function useIsThreadPanelOverlay() {
  return useIsAuxiliaryPanelOverlay();
}
