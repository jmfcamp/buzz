import * as React from "react";

import { loadHuddleDefaults } from "./huddleDefaults";

export type SavedHuddleDeviceSync = {
  claimDeviceEdit: () => number;
  claimGainEdit: () => number;
  deviceEditIsCurrent: (generation: number) => boolean;
};

/**
 * Load the saved microphone and gain into the audio owner.
 *
 * Each user edit or companion command bumps a generation. A load that
 * finishes later must not replace that newer choice.
 */
export function useSavedHuddleDevices(
  ownsAudioSession: boolean,
  setDeviceId: (deviceId: string) => void,
  setGain: (gain: number) => void,
): SavedHuddleDeviceSync {
  const deviceGeneration = React.useRef(0);
  const gainGeneration = React.useRef(0);

  React.useEffect(() => {
    if (!ownsAudioSession) {
      return;
    }
    const seenDevice = deviceGeneration.current;
    const seenGain = gainGeneration.current;
    let cancelled = false;
    void loadHuddleDefaults()
      .then((defaults) => {
        if (cancelled) {
          return;
        }
        if (seenDevice === deviceGeneration.current) {
          setDeviceId(defaults.microphoneDeviceId);
        }
        if (seenGain === gainGeneration.current) {
          setGain(defaults.microphoneGain);
        }
      })
      .catch(() => {
        // A missing file keeps the in-memory default. A bad file is not applied.
      });
    return () => {
      cancelled = true;
    };
  }, [ownsAudioSession, setDeviceId, setGain]);

  return React.useMemo(
    () => ({
      claimDeviceEdit: () => {
        deviceGeneration.current += 1;
        return deviceGeneration.current;
      },
      claimGainEdit: () => {
        gainGeneration.current += 1;
        return gainGeneration.current;
      },
      deviceEditIsCurrent: (generation: number) =>
        generation === deviceGeneration.current,
    }),
    [],
  );
}
