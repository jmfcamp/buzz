import * as React from "react";

import { toggleConnectionMessages } from "@/shared/lib/connectionMessages";
import { showStatus } from "@/shared/ui/statusPills";

const LONG_PRESS_MS = 500;

/**
 * Nav Refresh: a tap reloads (`onReload`); a long press (~500ms) or right-click toggles "show connection messages" instead
 * (never both). Gives a short haptic tick where supported and a brief note saying which mode is now on.
 */
export function useRefreshPress(onReload: () => void) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = React.useRef(false);
  const [pressing, setPressing] = React.useState(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPressing(false);
  };
  const toggle = () => {
    const nowOn = toggleConnectionMessages();
    try {
      navigator.vibrate?.(15);
    } catch {
      /* no haptics */
    }
    showStatus("connection-messages-mode", {
      tone: "success",
      title: nowOn ? "Connection messages on" : "Connection messages hidden",
      description: nowOn ? "Signer and connection status will show here. Long-press Refresh again to hide." : "The Refresh icon spins while the app reconnects.",
      testId: "connection-messages-mode",
    });
  };
  return {
    "data-pressing": pressing ? "true" : undefined,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      longFired.current = false;
      setPressing(true);
      timer.current = setTimeout(() => {
        longFired.current = true;
        setPressing(false);
        toggle();
      }, LONG_PRESS_MS);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      const alreadyToggled = longFired.current; // iOS raises contextmenu after our long-press timer fired
      clear();
      longFired.current = true;
      if (!alreadyToggled) toggle();
    },
    onClick: (e: React.MouseEvent) => {
      if (longFired.current) {
        e.preventDefault();
        longFired.current = false;
        return;
      }
      onReload();
    },
  };
}
