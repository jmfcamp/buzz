// Desktop: "Sign in a browser with this computer" — a one-time bunker:// code / QR for the web app (NIP-46 over the Hula
// signer relay, works off the tailnet). The code is good for 5 minutes and one browser; the browser still has to be
// allowed here. Paired browsers show in "Browsers that sign with this computer" (same list as Direct) with Revoke.
import * as React from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  SettingsOptionGroup,
  SettingsOptionRow,
} from "@/features/settings/ui/SettingsOptionGroup";
import { Button } from "@/shared/ui/button";
import {
  cancelSignInCode,
  newSignInCode,
  useDesktopBunkerState,
} from "../desktopBunkerRuntime";
import { StatusChip } from "./DesktopData";

export function DesktopBunkerPairCard() {
  const st = useDesktopBunkerState();
  const [code, setCode] = React.useState<{
    uri: string;
    expiresAt: number;
  } | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [code]);
  React.useEffect(() => () => cancelSignInCode(), []);
  const left = code
    ? Math.max(0, Math.round((code.expiresAt - now) / 1000))
    : 0;
  const live = !!code && left > 0 && st.codeActive;
  if (!st.available) return null;
  return (
    <SettingsOptionGroup
      data-testid="desktop-bunker"
      title="Sign in a browser with this computer"
    >
      <SettingsOptionRow>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            Web sign-in code
            <StatusChip
              tone={st.connected ? "green" : "grey"}
              testId="desktop-bunker-chip"
            >
              {st.connected ? "Signer relay connected" : "Idle"}
            </StatusChip>
          </p>
          <p
            className="text-sm font-normal text-muted-foreground/70"
            data-settings-subcopy
          >
            In the web app, choose "Sign in with your desktop" and scan this
            code (or paste it). Works on any network. The code works once, for 5
            minutes, and you still click Allow here. Your key never leaves this
            computer, and this computer must be on and running Hula Buzz for
            that browser to send.
          </p>
          {live && code && (
            <div className="mt-2 grid gap-2" data-testid="desktop-bunker-code">
              <div className="w-fit rounded-md bg-white p-2">
                <QRCodeSVG size={192} value={code.uri} />
              </div>
              <code
                className="block max-w-full break-all text-xs text-muted-foreground"
                data-testid="desktop-bunker-uri"
              >
                {code.uri}
              </code>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  Expires in {Math.floor(left / 60)}:
                  {String(left % 60).padStart(2, "0")}
                </span>
                <button
                  className="underline"
                  onClick={() =>
                    void navigator.clipboard?.writeText(code.uri).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    )
                  }
                  type="button"
                >
                  {copied ? "Copied" : "Copy code"}
                </button>
              </div>
            </div>
          )}
          {code && !live && (
            <p className="mt-1 text-sm text-muted-foreground">
              That code was used or expired.
            </p>
          )}
        </div>
        {live ? (
          <Button
            data-testid="desktop-bunker-cancel"
            onClick={() => {
              cancelSignInCode();
              setCode(null);
            }}
            size="sm"
            variant="outline"
          >
            Cancel
          </Button>
        ) : (
          <Button
            data-testid="desktop-bunker-new"
            onClick={() => {
              setCopied(false);
              setNow(Date.now());
              setCode(newSignInCode());
            }}
            size="sm"
          >
            Show code
          </Button>
        )}
      </SettingsOptionRow>
    </SettingsOptionGroup>
  );
}
