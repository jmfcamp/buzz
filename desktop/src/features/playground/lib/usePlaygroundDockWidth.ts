import * as React from "react";

import {
  clampPlaygroundDockWidth,
  defaultPlaygroundDockWidth,
  persistPlaygroundDockWidth,
  readStoredPlaygroundDockWidth,
  resolvePlaygroundDockWidth,
  resolvePlaygroundDockWidthOnDock,
  type PlaygroundDockThreadEdge,
} from "./dock";

/**
 * Left-dock width, persisted like the thread pane (`sessionStorage`).
 * Dragging the right edge grows/shrinks the preview and wins later docks.
 * Double-click resets to half of the current main inset. Dock-action snap
 * to an open thread only runs when the user has not resized.
 */
export function usePlaygroundDockWidth(
  getMainWidth: () => number,
  getThreadEdge?: () => PlaygroundDockThreadEdge | null,
) {
  const [widthPx, setWidthPx] = React.useState(() =>
    resolvePlaygroundDockWidth(getMainWidth()),
  );
  const userResizedRef = React.useRef(readStoredPlaygroundDockWidth() != null);

  React.useEffect(() => {
    if (!userResizedRef.current) return;
    persistPlaygroundDockWidth(widthPx);
  }, [widthPx]);

  const prepareDockWidth = React.useCallback(() => {
    setWidthPx(
      resolvePlaygroundDockWidthOnDock({
        mainWidth: getMainWidth(),
        threadEdge: getThreadEdge?.() ?? null,
        userResized: userResizedRef.current,
      }),
    );
  }, [getMainWidth, getThreadEdge]);

  const onResizeStart = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);

      const startX = event.clientX;
      const startWidth = widthPx;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      userResizedRef.current = true;

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
    userResizedRef.current = true;
    setWidthPx(defaultPlaygroundDockWidth(getMainWidth()));
  }, [getMainWidth]);

  return {
    onResetWidth,
    onResizeStart,
    prepareDockWidth,
    widthPx,
  };
}
