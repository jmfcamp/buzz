import type { BestieListKind } from "./bestieListTypes";

/** Omit empty counts the same way Projects overview does. */
export function presentBestieContextCount(
  value: number | undefined,
): number | undefined {
  return value != null && value > 0 ? value : undefined;
}

export function bestieCategoryTitle(kind: BestieListKind): string {
  return kind === "reminder" ? "Reminders" : "To-dos";
}

/**
 * IdleAuxiliary (slide) is only for a drilled-in category’s item list.
 * Categories themselves live in the fixed RHS column — never the slide.
 * Returns null when the slide must stay closed (category home).
 */
export function bestieIdleAuxiliaryKind(
  activeKind: BestieListKind | null,
): BestieListKind | null {
  return activeKind;
}
