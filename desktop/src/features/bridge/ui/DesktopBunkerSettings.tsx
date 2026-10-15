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
  const showCode = () => {
    setCopied(false);
    setNow(Date.now());
    setCode(newSignInCode());
  };
  const steps = [
    "Open hulabuzz.huladesk.com, or the installed Hula Buzz app.",
    "Choose \u201cSign in with your desktop\u201d.",
    "Scan the QR code, or paste the code.",
    "Click Allow here, once. That browser is then trusted.",
  ];
  return (
    <SettingsOptionGroup
      className="w-full [container-type:inline-size]"
      data-testid="desktop-bunker"
      surface="soft"
    >
      <SettingsOptionRow className="flex-col items-stretch justify-start gap-10 px-6 pb-4 pt-8 [@container(min-width:46rem)]:flex-row [@container(min-width:46rem)]:items-start [@container(min-width:46rem)]:px-10">
        <div className="flex w-[266px] max-w-full shrink-0 flex-col gap-3">
          <div
            className="flex min-h-[266px] w-[266px] max-w-full items-center justify-center rounded-lg border border-border/70 bg-background p-3"
            data-testid="desktop-bunker-qr-box"
          >
            {live && code ? (
              <div className="rounded-md bg-white p-2" data-testid="desktop-bunker-code">
                <QRCodeSVG size={224} value={code.uri} />
              </div>
            ) : (
              <div className="flex max-w-52 flex-col items-center gap-3 text-center">
                {code && (
                  <p className="text-sm text-muted-foreground">That code was used or expired.</p>
                )}
                <Button data-testid="desktop-bunker-new" onClick={showCode} size="sm">
                  {code ? "New code" : "Show code"}
                </Button>
              </div>
            )}
          </div>
          {live && code && (
            <>
              <code
                className="block max-w-full break-all text-xs text-muted-foreground"
                data-testid="desktop-bunker-uri"
              >
                {code.uri}
              </code>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>
                  Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
                </span>
                <Button
                  onClick={() =>
                    void navigator.clipboard?.writeText(code.uri).then(
                      () => setCopied(true),
                      () => setCopied(false),
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {copied ? "Copied" : "Copy code"}
                </Button>
                <Button
                  data-testid="desktop-bunker-cancel"
                  onClick={() => {
                    cancelSignInCode();
                    setCode(null);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            Sign in to Hula Buzz with this computer
            <StatusChip tone={st.connected ? "green" : "grey"} testId="desktop-bunker-chip">
              {st.connected ? "Signer relay connected" : "Idle"}
            </StatusChip>
          </p>
          <ol className="mt-3 flex list-none flex-col gap-3 p-0" data-testid="desktop-bunker-steps">
            {steps.map((t, i) => (
              <li className="flex gap-3 text-sm" key={t}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {i + 1}
                </span>
                <span className="pt-0.5">{t}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground/70" data-settings-subcopy>
            Works on any network. A code works once, for 5 minutes. Your key never leaves this computer, and it must be
            on and running Hula Buzz to sign.
          </p>
        </div>
      </SettingsOptionRow>
    </SettingsOptionGroup>
  );
}
