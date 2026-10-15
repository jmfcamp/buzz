/**
 * Shared phone/PWA soft-keyboard detection.
 *
 * iOS can leave visualViewport short after leave/return or a view switch even when the
 * OS keyboard is gone. Treat the keyboard as open only when BOTH:
 *   1) a keyboard-capable field is focused (not inputmode=none / readonly seed fields), and
 *   2) the visual viewport is meaningfully shorter than the layout / peak height.
 */

export const PHONE_KEYBOARD_MIN_COVERED_PX = 120;

export type VisualViewportLike = {
  height: number;
  offsetTop: number;
  width: number;
} | null | undefined;

/** True when this element would make iOS show the soft keyboard. */
export function isKeyboardCapableElement(el: Element | null | undefined): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) {
    return !el.readOnly && !el.disabled && el.inputMode !== "none";
  }
  if (el instanceof HTMLInputElement) {
    const t = el.type;
    if (el.readOnly || el.disabled || el.inputMode === "none") return false;
    return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color", "image", "hidden"].includes(t);
  }
  return el.isContentEditable;
}

export function isKeyboardCapableFocused(
  doc: Pick<Document, "activeElement" | "body"> = document,
): boolean {
  const el = doc.activeElement;
  return Boolean(el && el !== doc.body && isKeyboardCapableElement(el));
}

/** How many CSS pixels of the layout viewport the soft keyboard (or a stale short VV) covers. */
export function visualViewportCoveredPx(
  vv: VisualViewportLike,
  innerHeight: number,
): number {
  if (!vv) return 0;
  return Math.max(0, innerHeight - vv.height - vv.offsetTop, innerHeight - vv.height);
}

/**
 * Geometry-only: visual viewport looks like a soft keyboard is up.
 * Callers that own an explicit "keyboard wanted" flag (Buzz Term) must AND this with that flag.
 */
export function visualKeyboardOpen(
  vv: VisualViewportLike,
  innerHeight: number,
  minCoveredPx: number = PHONE_KEYBOARD_MIN_COVERED_PX,
): boolean {
  return visualViewportCoveredPx(vv, innerHeight) > minCoveredPx;
}

/**
 * Phone shell keyboard: capable focus + short visual viewport.
 * Peak height (maxH) covers engines that shrink both viewports together.
 */
export function phoneKeyboardOpen(opts: {
  vv: VisualViewportLike;
  innerHeight: number;
  /** Largest layout/visual height seen this orientation; optional. */
  maxH?: number;
  minCoveredPx?: number;
  focused?: boolean;
}): boolean {
  const focused = opts.focused ?? isKeyboardCapableFocused();
  if (!focused) return false;
  const min = opts.minCoveredPx ?? PHONE_KEYBOARD_MIN_COVERED_PX;
  if (visualKeyboardOpen(opts.vv, opts.innerHeight, min)) return true;
  if (opts.maxH != null && opts.vv) {
    return opts.vv.height < opts.maxH - Math.max(min, 150);
  }
  return false;
}

/** Keyboard-aware visible rect (Buzz Term layout). When `wanted` is false, never reports open. */
export function keyboardInset(
  vv: VisualViewportLike,
  innerHeight: number,
  minKeyboardPx: number = PHONE_KEYBOARD_MIN_COVERED_PX,
  wanted = true,
): { open: boolean; top: number; height: number; width: number } {
  if (!vv) return { open: false, top: 0, height: innerHeight, width: 0 };
  const open = wanted && visualKeyboardOpen(vv, innerHeight, minKeyboardPx);
  return { open, top: vv.offsetTop, height: open ? vv.height : innerHeight, width: vv.width };
}

/** Blur a stale keyboard-capable focus (resume / view switch when the OS keyboard is gone). */
export function blurStaleKeyboardFocus(
  doc: Pick<Document, "activeElement"> = document,
): void {
  const el = doc.activeElement;
  if (el instanceof HTMLElement && isKeyboardCapableElement(el)) el.blur();
}
