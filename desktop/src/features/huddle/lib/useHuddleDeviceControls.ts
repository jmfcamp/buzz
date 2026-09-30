import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import * as React from "react";

import {
  HUDDLE_AUDIO_COMMAND_EVENT,
  type HuddleAudioCommand,
  type HuddleAudioMirrorState,
} from "./huddleAudioBridge";
import { saveHuddleDefaults, saveMicrophoneGain } from "./huddleDefaults";
import type { SavedHuddleDeviceSync } from "./useSavedHuddleDevices";

/**
 * Persist microphone, gain, and speaker choices.
 *
 * The companion command listener applies the same values without writing the
 * file again. A failed write restores the previous live choice when it is
 * still the newest edit.
 */
export function useHuddleDeviceControls({
  ownsAudioSession,
  savedDevices,
  selectedDeviceId,
  selectedOutputDevice,
  setLocalMicGain,
  setLocalSelectedDeviceId,
  setMirroredAudioState,
  setSelectedOutputDeviceState,
}: {
  ownsAudioSession: boolean;
  savedDevices: SavedHuddleDeviceSync;
  selectedDeviceId: string;
  selectedOutputDevice: string;
  setLocalMicGain: (gain: number) => void;
  setLocalSelectedDeviceId: (deviceId: string) => void;
  setMirroredAudioState: React.Dispatch<
    React.SetStateAction<HuddleAudioMirrorState | null>
  >;
  setSelectedOutputDeviceState: (name: string) => void;
}) {
  const setSelectedDeviceId = React.useCallback(
    (deviceId: string) => {
      const seen = savedDevices.claimDeviceEdit();
      const previousId = selectedDeviceId;
      const applyDeviceId = (nextId: string) => {
        if (ownsAudioSession) {
          setLocalSelectedDeviceId(nextId);
          return;
        }
        setMirroredAudioState((previous) =>
          previous ? { ...previous, selectedDeviceId: nextId } : previous,
        );
        void emit(HUDDLE_AUDIO_COMMAND_EVENT, {
          type: "set-input-device",
          deviceId: nextId,
        } satisfies HuddleAudioCommand);
      };
      applyDeviceId(deviceId);
      return saveHuddleDefaults({ microphoneDeviceId: deviceId }).then(
        () => undefined,
        (error: unknown) => {
          if (savedDevices.deviceEditIsCurrent(seen)) {
            applyDeviceId(previousId);
          }
          throw error;
        },
      );
    },
    [
      ownsAudioSession,
      savedDevices,
      selectedDeviceId,
      setLocalSelectedDeviceId,
      setMirroredAudioState,
    ],
  );

  const setMicGain = React.useCallback(
    (gain: number) => {
      const clamped = Math.max(0, Math.min(1, gain));
      savedDevices.claimGainEdit();
      saveMicrophoneGain(clamped);
      if (ownsAudioSession) {
        setLocalMicGain(clamped);
        return;
      }
      setMirroredAudioState((previous) =>
        previous ? { ...previous, micGain: clamped } : previous,
      );
      void emit(HUDDLE_AUDIO_COMMAND_EVENT, {
        type: "set-mic-gain",
        gain: clamped,
      } satisfies HuddleAudioCommand);
    },
    [ownsAudioSession, savedDevices, setLocalMicGain, setMirroredAudioState],
  );

  const outputDeviceRequest = React.useRef(0);
  const setSelectedOutputDevice = React.useCallback(
    (name: string): Promise<void> => {
      const request = ++outputDeviceRequest.current;
      const previous = selectedOutputDevice;
      setSelectedOutputDeviceState(name);
      return invoke("set_audio_output_device", { name }).then(
        () => undefined,
        (error: unknown) => {
          if (request === outputDeviceRequest.current) {
            setSelectedOutputDeviceState(previous);
          }
          throw error;
        },
      );
    },
    [selectedOutputDevice, setSelectedOutputDeviceState],
  );

  return { setMicGain, setSelectedDeviceId, setSelectedOutputDevice };
}
