/**
 * Pure Drive activity strip state machine.
 * Phases: idle → active (sticky for the whole LLM turn) → finishing → idle.
 * Timers live in the hook; this reducer only maps events → next phase/text.
 */

import {
  DRIVE_ACTIVITY_CLEAR_MS,
  DRIVE_ACTIVITY_FINISHED,
  DRIVE_ACTIVITY_TURN_IDLE_MS,
} from "./driveActivityCaption";

export { DRIVE_ACTIVITY_CLEAR_MS, DRIVE_ACTIVITY_TURN_IDLE_MS };

export type DriveActivityPhase = "idle" | "active" | "finishing";

export type DriveActivityState = {
  phase: DriveActivityPhase;
  text: string | null;
};

export type DriveActivityAction =
  /** New drive/snapshot/drive_error caption — stay/enter active, never Finished. */
  | { type: "activity"; caption: string }
  /** TURN_IDLE_MS elapsed with no new activity while active. */
  | { type: "turn_idle" }
  /** CLEAR_MS elapsed while finishing ("Finished" shown). */
  | { type: "clear" }
  /** Mode off / disabled / unmount — wipe immediately. */
  | { type: "reset" };

export const INITIAL_DRIVE_ACTIVITY: DriveActivityState = {
  phase: "idle",
  text: null,
};

/**
 * Reduce Drive chrome activity. While `active`, only the caption text changes;
 * Finished/clear happen only after sustained turn idle, not between tools.
 */
export function reduceDriveActivity(
  state: DriveActivityState,
  action: DriveActivityAction,
): DriveActivityState {
  switch (action.type) {
    case "activity":
      return { phase: "active", text: action.caption };
    case "turn_idle":
      if (state.phase !== "active") return state;
      return { phase: "finishing", text: DRIVE_ACTIVITY_FINISHED };
    case "clear":
      if (state.phase !== "finishing") return state;
      return INITIAL_DRIVE_ACTIVITY;
    case "reset":
      return INITIAL_DRIVE_ACTIVITY;
    default:
      return state;
  }
}

/** Which timer the hook should arm after applying `next` (null = none). */
export function driveActivityTimerMs(
  next: DriveActivityState,
): number | null {
  if (next.phase === "active") return DRIVE_ACTIVITY_TURN_IDLE_MS;
  if (next.phase === "finishing") return DRIVE_ACTIVITY_CLEAR_MS;
  return null;
}
