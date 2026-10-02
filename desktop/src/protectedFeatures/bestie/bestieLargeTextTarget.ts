/** Marker for the portaled reader. The Assistant popover must stay open over it. */
export const BESTIE_LARGE_TEXT_ROOT_ATTR = "data-bestie-large-text-root";

/** Accessible name for the per-row control that opens the fullscreen reader. */
export function bestieLargeTextOpenLabel(title: string): string {
  const trimmed = title.trim() || "note";
  return `Open fullscreen: ${trimmed}`;
}

/**
 * True when an outside pointer or focus event landed in the large-text reader.
 * The reader is portaled above the Assistant popover, so Radix would otherwise
 * treat it as an outside click and close the list underneath.
 */
export function bestiePopoverShouldIgnoreOutside(
  target: EventTarget | null,
): boolean {
  const element = elementFromEventTarget(target);
  if (!element) return false;
  return Boolean(element.closest(`[${BESTIE_LARGE_TEXT_ROOT_ATTR}]`));
}

function elementFromEventTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}
