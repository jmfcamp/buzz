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
