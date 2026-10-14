// Web Settings → Desktop signing: the desktop as this app's main signer over the signer relay (works on any network).
// Shows its status, pairs it (scan/paste the desktop's sign-in code), forgets it (revoked on the desktop too), and offers
// Clave as the backup signer for a desktop-only session.
import * as React from "react";
import {
  SettingsOptionGroup,
  SettingsOptionRow,
} from "@/features/settings/ui/SettingsOptionGroup";
import { StatusChip } from "@/features/bridge/ui/DesktopData";
import { Button } from "@/shared/ui/button";
import { DesktopSignInPanel } from "./DesktopSignInPanel";
import { addDesktopSigner, getSession } from "./signer";
import {
  desktopBunkerStatus,
  forgetDesktopBunker,
  hasDesktopBunker,
  onDesktopBunkerChange,
  check,
} from "./signer/desktopBunker";

export function WebDesktopBunkerCard() {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => onDesktopBunkerChange(bump), []);
  const [note, setNote] = React.useState<string | null>(null);
  const st = desktopBunkerStatus();
  const paired = hasDesktopBunker();
  const desktopOnly = getSession()?.kind === "desktop";
  const chip = !paired
    ? st === "revoked"
      ? "Revoked"
      : "Not set up"
    : st === "online"
      ? "Online"
      : st === "offline"
        ? "Offline"
        : "Checking…";
  return (
    <SettingsOptionGroup
      data-testid="web-desktop-bunker"
      title="Your desktop as signer"
    >
      <SettingsOptionRow>
        <div className="min-w-0 w-full">
          <p className="flex items-center gap-2 text-sm font-medium">
            Desktop signer (any network)
            <StatusChip
              tone={paired && st === "online" ? "green" : "grey"}
              testId="web-desktop-bunker-chip"
            >
              {chip}
            </StatusChip>
          </p>
          <p
            className="text-sm font-normal text-muted-foreground/70"
            data-settings-subcopy
          >
            {paired
              ? desktopOnly
                ? "Your desktop signs for this app. When it's off or asleep, Buzz is read-only. Add Clave as a backup to keep sending while it's away."
                : "Your desktop signs first. When it's off or asleep, your remote signer (Clave) takes over, and the desktop takes back over as soon as it answers."
              : "Let your desktop sign for this app, over the internet (no tailnet needed). Your key stays on the desktop. Your current signer stays as the backup."}
          </p>
          {!paired && (
            <div className="mt-2 max-w-md">
              <DesktopSignInPanel
                cta="Use my desktop to sign"
                connect={async (code) => {
                  await addDesktopSigner(code);
                  setNote("Your desktop now signs for this app.");
                }}
              />
            </div>
          )}
          {note && (
            <p
              className="mt-1 text-sm text-muted-foreground"
              data-testid="web-desktop-bunker-note"
            >
              {note}
            </p>
          )}
        </div>
        {paired && (
          <div className="flex shrink-0 flex-col gap-2">
            {st !== "online" && (
              <Button onClick={() => void check()} size="sm" variant="outline">
                Retry
              </Button>
            )}
            {desktopOnly && (
              <Button
                data-testid="web-desktop-bunker-add-clave"
                onClick={() =>
                  void import("./UnlockScreen")
                    .then((m) => m.showUnlockOverlay())
                    .then(() => bump())
                }
                size="sm"
                variant="outline"
              >
                Add Clave as backup
              </Button>
            )}
            {!desktopOnly && (
              <Button
                data-testid="web-desktop-bunker-forget"
                onClick={() =>
                  void forgetDesktopBunker().then(() =>
                    setNote(
                      "Forgotten here and revoked on your desktop (if it was reachable).",
                    ),
                  )
                }
                size="sm"
                variant="outline"
              >
                Forget
              </Button>
            )}
          </div>
        )}
      </SettingsOptionRow>
    </SettingsOptionGroup>
  );
}
