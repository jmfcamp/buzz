import { isTauri } from "@tauri-apps/api/core";

/** Web on a touch-only device (iPhone/iPad PWA): programmatic focus of a text field pops the software keyboard, so
 *  pickers and menus must not autofocus their search inputs there. Desktop app and pointer devices return false. */
export function isTouchWeb(): boolean {
  if (typeof window === "undefined" || isTauri()) return false;
  return (
    window.matchMedia?.("(hover: none) and (pointer: coarse)").matches ?? false
  );
}
