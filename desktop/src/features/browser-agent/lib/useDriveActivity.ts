import * as React from "react";

import { subscribeBrowserAgentObserve } from "./api";
import {
  DRIVE_ACTIVITY_CLEAR_MS,
  DRIVE_ACTIVITY_TURN_IDLE_MS,
  driveActivityCaption,
  type DriveActivityPayload,
} from "./driveActivityCaption";
import {
  INITIAL_DRIVE_ACTIVITY,
  reduceDriveActivity,
  type DriveActivityState,
} from "./driveActivityState";
import type { BrowserAgentMode } from "./types";

/**
 * Live Drive activity caption for one webview.
 *
 * One continuous turn: first drive_started / drive / snapshot / drive_error
 * while Drive is granted opens a sticky strip; subsequent actions update the
 * same caption. Only after sustained idle (TURN_IDLE_MS ≈ 14s — LLM think
 * time between tools) do we show Finished, then CLEAR_MS → empty.
 * Empty when mode is not Drive or when `enabled` is false (Browsers list).
 * Take control does not reset (mode stays drive).
 */
export function useDriveActivity(
  webviewLabel: string,
  mode: BrowserAgentMode | "off",
  enabled: boolean,
): string | null {
  const [state, setState] = React.useState<DriveActivityState>(
    INITIAL_DRIVE_ACTIVITY,
  );
  const timerRef = React.useRef<number | null>(null);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const clearTimer = React.useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commit = React.useCallback((next: DriveActivityState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  /** After each activity: wait TURN_IDLE_MS → Finished → CLEAR_MS → idle. */
  const scheduleTurnEnd = React.useCallback(() => {
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const finishing = reduceDriveActivity(stateRef.current, {
        type: "turn_idle",
      });
      commit(finishing);
      if (finishing.phase !== "finishing") return;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        commit(reduceDriveActivity(stateRef.current, { type: "clear" }));
      }, DRIVE_ACTIVITY_CLEAR_MS);
    }, DRIVE_ACTIVITY_TURN_IDLE_MS);
  }, [clearTimer, commit]);

  // Stable listen callback so the subscribe effect does not rebind (and kill
  // the turn-idle timer) between tools.
  const onActivityRef = React.useRef<(caption: string) => void>(() => {});
  onActivityRef.current = (caption: string) => {
    commit(
      reduceDriveActivity(stateRef.current, {
        type: "activity",
        caption,
      }),
    );
    scheduleTurnEnd();
  };

  const live = enabled && mode === "drive";

  React.useEffect(() => {
    if (!live) {
      clearTimer();
      commit(INITIAL_DRIVE_ACTIVITY);
      return;
    }

    let cancelled = false;
    const unlisten = subscribeBrowserAgentObserve((event) => {
      if (cancelled) return;
      if (event.webviewLabel !== webviewLabel) return;
      const caption = driveActivityCaption(
        event.kind,
        event.payload as DriveActivityPayload | null | undefined,
      );
      if (!caption) return;
      onActivityRef.current(caption);
    });

    return () => {
      cancelled = true;
      clearTimer();
      void unlisten.then((stop) => stop());
    };
  }, [clearTimer, commit, live, webviewLabel]);

  return state.text;
}
