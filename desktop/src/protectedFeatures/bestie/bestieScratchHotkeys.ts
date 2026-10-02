import { hasPrimaryShortcutModifier } from "@/shared/lib/platform";

type ScratchChordEvent = Pick<
  KeyboardEvent,
  | "altKey"
  | "ctrlKey"
  | "isComposing"
  | "key"
  | "metaKey"
  | "repeat"
  | "shiftKey"
>;

/**
 * Scratch pad chords. Command+Enter starts a note. Command+Shift+Enter
 * saves the open note and closes it. Control replaces Command off Mac.
 */
export function bestieScratchChord(
  event: ScratchChordEvent,
): "new" | "save-close" | null {
  if (event.repeat || event.altKey || event.isComposing) return null;
  if (event.key !== "Enter") return null;
  if (!hasPrimaryShortcutModifier(event)) return null;
  return event.shiftKey ? "save-close" : "new";
}
