import { invokeTauri } from "@/shared/api/tauri";

export type HuddleDefaults = {
  version: 1;
  pushToTalk: boolean;
  microphoneDeviceId: string;
  speakerDeviceName: string;
  cameraDeviceId: string;
  microphoneGain: number;
};

export type HuddleDefaultsPatch = {
  pushToTalk?: boolean;
  microphoneDeviceId?: string;
  speakerDeviceName?: string;
  cameraDeviceId?: string;
  microphoneGain?: number;
};

export const DEFAULT_HUDDLE_DEFAULTS: HuddleDefaults = {
  version: 1,
  pushToTalk: true,
  microphoneDeviceId: "",
  speakerDeviceName: "",
  cameraDeviceId: "",
  microphoneGain: 1,
};

const MAX_DEVICE_CHARS = 512;

export function clampMicrophoneGain(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}

function deviceName(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > MAX_DEVICE_CHARS
    ? trimmed.slice(0, MAX_DEVICE_CHARS)
    : trimmed;
}

/** Fill gaps from a command payload. Missing `pushToTalk` stays on. */
export function normalizeHuddleDefaults(value: unknown): HuddleDefaults {
  const record =
    value && typeof value === "object"
      ? (value as Partial<HuddleDefaults>)
      : {};
  return {
    version: 1,
    pushToTalk: record.pushToTalk !== false,
    microphoneDeviceId: deviceName(record.microphoneDeviceId),
    speakerDeviceName: deviceName(record.speakerDeviceName),
    cameraDeviceId: deviceName(record.cameraDeviceId),
    microphoneGain: clampMicrophoneGain(
      typeof record.microphoneGain === "number" ? record.microphoneGain : 1,
    ),
  };
}

export function loadHuddleDefaults(): Promise<HuddleDefaults> {
  return invokeTauri<unknown>("get_huddle_defaults").then(
    normalizeHuddleDefaults,
  );
}

let gainTimer: ReturnType<typeof setTimeout> | null = null;
let defaultsWrite: Promise<unknown> = Promise.resolve();

export function saveHuddleDefaults(
  patch: HuddleDefaultsPatch,
): Promise<HuddleDefaults> {
  const write = defaultsWrite.then(() =>
    invokeTauri<unknown>("set_huddle_defaults", { patch }).then(
      normalizeHuddleDefaults,
    ),
  );
  defaultsWrite = write.then(
    () => undefined,
    () => undefined,
  );
  return write;
}

/** Persist gain after the slider settles so each tick does not rewrite the file. */
export function saveMicrophoneGain(gain: number): void {
  const clamped = clampMicrophoneGain(gain);
  if (gainTimer) {
    clearTimeout(gainTimer);
  }
  gainTimer = setTimeout(() => {
    gainTimer = null;
    void saveHuddleDefaults({ microphoneGain: clamped });
  }, 250);
}

export type MediaDeviceOption = {
  id: string;
  label: string;
};

/**
 * Device id to pass as `exact` to getUserMedia.
 *
 * An empty saved id uses the system default. A saved id that is missing from
 * a non-empty enumeration is omitted so an unplugged microphone does not fail
 * the huddle. An empty enumeration has not finished, so the saved id is kept.
 */
export function exactMicrophoneDeviceId(
  selectedDeviceId: string,
  enumeratedIds: readonly string[],
): string | null {
  if (!selectedDeviceId) {
    return null;
  }
  if (enumeratedIds.length > 0 && !enumeratedIds.includes(selectedDeviceId)) {
    return null;
  }
  return selectedDeviceId;
}

export function mediaDeviceOptions(
  devices: ReadonlyArray<{ deviceId: string; label: string; kind?: string }>,
  kind: "audioinput" | "videoinput",
  savedId: string,
  fallbackLabel: string,
): MediaDeviceOption[] {
  const options: MediaDeviceOption[] = [{ id: "", label: "System default" }];
  for (const device of devices) {
    if (device.kind && device.kind !== kind) {
      continue;
    }
    if (!device.deviceId) {
      continue;
    }
    options.push({
      id: device.deviceId,
      label: device.label.trim() || fallbackLabel,
    });
  }
  if (savedId && !options.some((option) => option.id === savedId)) {
    options.push({ id: savedId, label: "Saved device (unplugged)" });
  }
  return options;
}
