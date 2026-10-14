import { isTauri } from "@tauri-apps/api/core";

import { ContextMenuCheckboxItem } from "@/shared/ui/context-menu";

import { setWebPinOpenInBuzz, useWebPinOpenInBuzz } from "../lib/webPinOpen";

/** Web-only context-menu checkbox: per-device "Open with Buzz" for a pinned site. */
export function OpenWithBuzzMenuItem({ pinId }: { pinId: string }) {
  const on = useWebPinOpenInBuzz(pinId);
  if (isTauri()) return null;
  return (
    <ContextMenuCheckboxItem
      checked={on}
      data-testid="open-with-buzz"
      onCheckedChange={(v) => setWebPinOpenInBuzz(pinId, v === true)}
    >
      Open with Buzz
    </ContextMenuCheckboxItem>
  );
}
