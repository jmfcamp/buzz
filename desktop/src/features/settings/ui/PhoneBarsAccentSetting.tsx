import { isTauri } from "@tauri-apps/api/core";

import {
  setPhoneBarsAccent,
  usePhoneBarsAccent,
} from "@/shared/theme/phoneBarsAccent";
import { Switch } from "@/shared/ui/switch";

import { SettingsOptionRow } from "./SettingsOptionGroup";

/** Web only, right under Accent color (shown only when an accent is chosen): accent on the phone top + bottom bars. */
export function PhoneBarsAccentSetting() {
  const on = usePhoneBarsAccent();
  if (isTauri()) return null;
  return (
    <SettingsOptionRow data-testid="phone-bars-accent-row">
      <div className="min-w-0">
        <label
          className="text-sm font-medium"
          htmlFor="phone-bars-accent-switch"
        >
          Use accent color for phone bars
        </label>
        <p
          className="text-sm font-normal text-muted-foreground/70"
          data-settings-subcopy
        >
          Tints the top bar and the bottom tab bar on phones, in every theme
          including Buzz. Saved on this device.
        </p>
      </div>
      <Switch
        checked={on}
        data-testid="phone-bars-accent-toggle"
        id="phone-bars-accent-switch"
        onCheckedChange={(v) => setPhoneBarsAccent(v)}
      />
    </SettingsOptionRow>
  );
}
