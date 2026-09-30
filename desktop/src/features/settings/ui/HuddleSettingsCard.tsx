import * as React from "react";
import { ChevronDown } from "lucide-react";

import { useHuddle } from "@/features/huddle/HuddleContext";
import {
  clampMicrophoneGain,
  loadHuddleDefaults,
  mediaDeviceOptions,
  saveHuddleDefaults,
  type HuddleDefaults,
} from "@/features/huddle/lib/huddleDefaults";
import { invokeTauri } from "@/shared/api/tauri";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Switch } from "@/shared/ui/switch";
import {
  SettingsOptionGroup,
  SettingsOptionGroupList,
  SettingsOptionRow,
} from "./SettingsOptionGroup";
import { SettingsSectionHeader } from "./SettingsSectionHeader";

const SYSTEM_DEVICE_VALUE = "system-default";

type OutputDevice = {
  name: string;
  is_default: boolean;
};

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function menuValue(id: string): string {
  return id.length === 0 ? SYSTEM_DEVICE_VALUE : id;
}

function deviceIdFromMenu(value: string): string {
  return value === SYSTEM_DEVICE_VALUE ? "" : value;
}

function DevicePicker({
  description,
  disabled,
  label,
  onSelect,
  options,
  testId,
  value,
}: {
  description?: string;
  disabled: boolean;
  label: string;
  onSelect: (id: string) => void;
  options: ReadonlyArray<{ id: string; label: string }>;
  testId: string;
  value: string;
}) {
  const selected = options.find((option) => option.id === value) ?? options[0];
  const selectedLabel = selected?.label ?? "System default";

  return (
    <SettingsOptionRow>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description ? (
          <p className="text-sm text-muted-foreground/70" data-settings-subcopy>
            {description}
          </p>
        ) : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`${label}: ${selectedLabel}`}
            className="min-w-32 max-w-64 justify-between"
            data-testid={testId}
            disabled={disabled}
            type="button"
            variant="outline"
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
          <DropdownMenuRadioGroup
            onValueChange={(next) => onSelect(deviceIdFromMenu(next))}
            value={menuValue(value)}
          >
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={menuValue(option.id)}
                value={menuValue(option.id)}
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SettingsOptionRow>
  );
}

export function HuddleSettingsCard() {
  const {
    setMicGain,
    setSelectedDeviceId,
    setSelectedOutputDevice,
    setVoiceInputMode,
  } = useHuddle();
  const [defaults, setDefaults] = React.useState<HuddleDefaults | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [revealing, setRevealing] = React.useState(false);
  const [inputs, setInputs] = React.useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = React.useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = React.useState<OutputDevice[]>([]);
  const mounted = React.useRef(true);
  const edit = React.useRef(0);

  const refreshDevices = React.useCallback(async () => {
    const media = window.navigator.mediaDevices;
    if (media?.enumerateDevices) {
      try {
        const listed = await media.enumerateDevices();
        if (!mounted.current) {
          return;
        }
        setInputs(listed.filter((device) => device.kind === "audioinput"));
        setCameras(listed.filter((device) => device.kind === "videoinput"));
      } catch {
        // Keep the last list when the browser refuses enumeration.
      }
    }
    try {
      const listed = await invokeTauri<OutputDevice[]>(
        "list_audio_output_devices",
      );
      if (mounted.current) {
        setSpeakers(listed);
      }
    } catch {
      // Speaker names are optional. The saved name still appears as unplugged.
    }
  }, []);

  React.useEffect(() => {
    mounted.current = true;
    let disposed = false;
    void loadHuddleDefaults()
      .then((next) => {
        if (!disposed) {
          setDefaults(next);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) {
          setLoadError(
            errorText(error, "Huddle defaults could not be loaded."),
          );
        }
      });
    void refreshDevices();
    return () => {
      disposed = true;
      mounted.current = false;
    };
  }, [refreshDevices]);

  const controlsDisabled = !defaults || Boolean(loadError) || busy;
  const pushToTalk = defaults?.pushToTalk ?? true;

  const showDeviceNames = async () => {
    if (revealing) {
      return;
    }
    setRevealing(true);
    let stream: MediaStream | null = null;
    try {
      const media = window.navigator.mediaDevices;
      if (media?.getUserMedia) {
        try {
          stream = await media.getUserMedia({ audio: true, video: true });
        } catch {
          // Permission can fail. Enumeration still runs. The camera stays off.
        }
      }
      await refreshDevices();
    } finally {
      for (const track of stream?.getTracks() ?? []) {
        track.stop();
      }
      if (mounted.current) {
        setRevealing(false);
      }
    }
  };

  const selectMicrophone = (id: string) => {
    const seen = ++edit.current;
    const previous = defaults?.microphoneDeviceId ?? "";
    setDefaults((current) =>
      current ? { ...current, microphoneDeviceId: id } : current,
    );
    void setSelectedDeviceId(id).catch((error: unknown) => {
      if (seen !== edit.current) {
        return;
      }
      setDefaults((current) =>
        current ? { ...current, microphoneDeviceId: previous } : current,
      );
      setSaveError(errorText(error, "The microphone could not be saved."));
    });
  };

  const selectSpeaker = (name: string) => {
    const seen = ++edit.current;
    const previous = defaults?.speakerDeviceName ?? "";
    setDefaults((current) =>
      current ? { ...current, speakerDeviceName: name } : current,
    );
    void setSelectedOutputDevice(name).catch((error: unknown) => {
      if (seen !== edit.current) {
        return;
      }
      setDefaults((current) =>
        current ? { ...current, speakerDeviceName: previous } : current,
      );
      setSaveError(errorText(error, "The speakers could not be saved."));
    });
  };

  const selectCamera = (id: string) => {
    const seen = ++edit.current;
    const previous = defaults?.cameraDeviceId ?? "";
    setDefaults((current) =>
      current ? { ...current, cameraDeviceId: id } : current,
    );
    void saveHuddleDefaults({ cameraDeviceId: id })
      .then((saved) => {
        if (seen === edit.current) {
          setDefaults(saved);
        }
      })
      .catch((error: unknown) => {
        if (seen !== edit.current) {
          return;
        }
        setDefaults((current) =>
          current ? { ...current, cameraDeviceId: previous } : current,
        );
        setSaveError(errorText(error, "The camera could not be saved."));
      });
  };

  const changeGain = (value: number) => {
    const gain = clampMicrophoneGain(value);
    setDefaults((current) =>
      current ? { ...current, microphoneGain: gain } : current,
    );
    setMicGain(gain);
  };

  const changePushToTalk = (enabled: boolean) => {
    const seen = ++edit.current;
    setBusy(true);
    setSaveError(null);
    void setVoiceInputMode(enabled ? "push_to_talk" : "voice_activity")
      .then(() => {
        if (seen !== edit.current) {
          return;
        }
        setDefaults((current) =>
          current ? { ...current, pushToTalk: enabled } : current,
        );
      })
      .catch((error: unknown) => {
        if (seen !== edit.current) {
          return;
        }
        setSaveError(errorText(error, "Push to Talk could not be saved."));
      })
      .finally(() => {
        if (mounted.current) {
          setBusy(false);
        }
      });
  };

  const microphoneOptions = mediaDeviceOptions(
    inputs,
    "audioinput",
    defaults?.microphoneDeviceId ?? "",
    "Microphone",
  );
  const cameraOptions = mediaDeviceOptions(
    cameras,
    "videoinput",
    defaults?.cameraDeviceId ?? "",
    "Camera",
  );
  const speakerOptions = mediaDeviceOptions(
    speakers.map((device) => ({
      deviceId: device.name,
      label: device.name,
    })),
    "audioinput",
    defaults?.speakerDeviceName ?? "",
    "Speakers",
  );

  return (
    <section className="min-w-0" data-testid="settings-huddle">
      <SettingsSectionHeader
        title="Huddle"
        description="Choose the devices and the microphone mode a huddle starts with."
      />
      {loadError ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}
      {saveError ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {saveError}
        </p>
      ) : null}
      <SettingsOptionGroupList>
        <SettingsOptionGroup
          description="A device change takes effect on the next huddle."
          headerAction={
            <Button
              data-testid="huddle-show-device-names"
              disabled={controlsDisabled || revealing}
              onClick={() => void showDeviceNames()}
              size="sm"
              type="button"
              variant="outline"
            >
              Show device names
            </Button>
          }
          title="Devices"
        >
          <DevicePicker
            disabled={controlsDisabled}
            label="Microphone"
            onSelect={selectMicrophone}
            options={microphoneOptions}
            testId="huddle-microphone"
            value={defaults?.microphoneDeviceId ?? ""}
          />
          <DevicePicker
            disabled={controlsDisabled}
            label="Speakers"
            onSelect={selectSpeaker}
            options={speakerOptions}
            testId="huddle-speakers"
            value={defaults?.speakerDeviceName ?? ""}
          />
          <DevicePicker
            description="Saved for when huddle video exists. Buzz does not turn the camera on."
            disabled={controlsDisabled}
            label="Camera"
            onSelect={selectCamera}
            options={cameraOptions}
            testId="huddle-camera"
            value={defaults?.cameraDeviceId ?? ""}
          />
        </SettingsOptionGroup>
        <SettingsOptionGroup title="Input">
          <SettingsOptionRow>
            <div className="min-w-0">
              <label
                className="text-sm font-medium"
                htmlFor="huddle-push-to-talk"
              >
                Push to Talk
              </label>
              <p
                className="text-sm text-muted-foreground/70"
                data-settings-subcopy
                id="huddle-push-to-talk-hint"
              >
                Huddles start muted. Hold the shortcut to talk. Turn this off to
                leave the microphone open.
              </p>
            </div>
            <Switch
              aria-describedby="huddle-push-to-talk-hint"
              checked={pushToTalk}
              data-testid="huddle-push-to-talk-switch"
              disabled={controlsDisabled}
              id="huddle-push-to-talk"
              onCheckedChange={(checked) => changePushToTalk(checked)}
            />
          </SettingsOptionRow>
          <SettingsOptionRow>
            <div className="min-w-0 flex-1">
              <label
                className="text-sm font-medium"
                htmlFor="huddle-input-volume"
              >
                Input volume
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
                  data-testid="huddle-input-volume"
                  disabled={controlsDisabled}
                  id="huddle-input-volume"
                  max={1}
                  min={0}
                  onChange={(event) => changeGain(Number(event.target.value))}
                  step={0.01}
                  type="range"
                  value={defaults?.microphoneGain ?? 1}
                />
                <span
                  aria-hidden="true"
                  className="w-8 text-right text-xs text-muted-foreground"
                >
                  {Math.round((defaults?.microphoneGain ?? 1) * 100)}%
                </span>
              </div>
            </div>
          </SettingsOptionRow>
        </SettingsOptionGroup>
      </SettingsOptionGroupList>
    </section>
  );
}
