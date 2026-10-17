import * as React from "react";
import { isTauri } from "@tauri-apps/api/core";

import {
  isKeyboardAssistOn,
  setKeyboardAssist,
  subscribeKeyboardAssist,
} from "@/shared/lib/keyboardAssist";
import { Switch } from "@/shared/ui/switch";

import { SettingsOptionRow } from "./SettingsOptionGroup";

/** Web only: let the phone/browser keyboard autocorrect, capitalize and suggest words in message boxes. */
export function KeyboardAssistSetting() {
  const on = React.useSyncExternalStore(
    subscribeKeyboardAssist,
    isKeyboardAssistOn,
    isKeyboardAssistOn,
  );
  if (isTauri()) return null;
  return (
    <SettingsOptionRow data-testid="keyboard-assist-row">
      <div className="min-w-0">
        <label className="text-sm font-medium" htmlFor="keyboard-assist-switch">
          Keyboard autocorrect &amp; suggestions
        </label>
        <p
          className="text-sm font-normal text-muted-foreground/70"
          data-settings-subcopy
        >
          Autocorrect, capitals and word suggestions in message boxes and
          search. Never in Buzz Term. Saved on this device.
        </p>
      </div>
      <Switch
        checked={on}
        data-testid="keyboard-assist-toggle"
        id="keyboard-assist-switch"
        onCheckedChange={(v) => setKeyboardAssist(v)}
      />
    </SettingsOptionRow>
  );
}
