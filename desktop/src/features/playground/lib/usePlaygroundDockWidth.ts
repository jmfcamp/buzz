import * as React from "react";

import {
  clampPlaygroundDockWidth,
  defaultPlaygroundDockWidth,
  persistPlaygroundDockWidth,
  readStoredPlaygroundDockWidth,
  resolvePlaygroundDockWidth,
} from "./dock";

/**
 * Left-dock width, persisted like the thread pane (`sessionStorage`).
 * Dragging the right edge grows/shrinks the preview; double-click resets to
 * half of the current main inset.
 */
export function usePlaygroundDockWidth(getMainWidth: () => number) {
  const [widthPx, setWidthPx] = React.useState(() =>
    resolvePlaygroundDockWidth(getMainWidth()),
  );
  const persistEnabledRef = React.useRef(
    readStoredPlaygroundDockWidth() != null,
  );

  React.useEffect(() => {
    if (!persistEnabledRef.current) return;
    persistPlaygroundDockWidth(widthPx);
  }, [widthPx]);

  const prepareDockWidth = React.useCallback(() => {
    persistEnabledRef.current = true;
    setWidthPx(resolvePlaygroundDockWidth(getMainWidth()));
  }, [getMainWidth]);

  const onResizeStart = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();

      const startX = event.clientX;
      const startWidth = widthPx;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        setWidthPx(
          clampPlaygroundDockWidth(startWidth + deltaX, getMainWidth()),
        );
      };

      const handlePointerUp = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", handlePointerMove);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp, { once: true });
    },
    [getMainWidth, widthPx],
  );

  const onResetWidth = React.useCallback(() => {
    setWidthPx(defaultPlaygroundDockWidth(getMainWidth()));
  }, [getMainWidth]);

  return {
    onResetWidth,
    onResizeStart,
    prepareDockWidth,
    widthPx,
  };
}
