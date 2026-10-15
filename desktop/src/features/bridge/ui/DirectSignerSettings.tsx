// Settings: "desktop as signer over Direct". Web: pair this browser with the desktop. Desktop: approved browsers,
// their signing log, and revoke. No keys are shown or exported anywhere; only device PUBLIC keys are listed.
import * as React from "react";
import { SettingsOptionGroup, SettingsOptionRow } from "@/features/settings/ui/SettingsOptionGroup";
import { Button } from "@/shared/ui/button";
import { getProxyDirect } from "../remoteCmd";
import { revokeSignerDevice, localSignerStore, signerLog, subscribeSignerStore, type SignerDevice } from "../directSigner";
import { describeDevice } from "../deviceMeta";
import { describePairingError, DirectSignerClient, forgetAndRevoke, isPairedWith, PairingError, PAIRING_EVENT } from "../directSignerClient";
import { useDirectState } from "./DirectAgentsPanel";
import { StatusChip } from "./DesktopData";
import { browserLabel } from "./useDirectSignerBanner";
import { useRemoteHosts } from "./WebRemoteSettings";

/** Web: pair this browser so the desktop signs for it over Direct (Primal stays the fallback). */
export function WebDirectSignerCard() {
  const rh = useRemoteHosts();
  const host = rh.selected("agents") ?? rh.hosts.find((h) => h.supports.agents && h.hasDirect);
  const direct = getProxyDirect();
  const { live } = useDirectState(direct);
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener(PAIRING_EVENT, bump);
    return () => window.removeEventListener(PAIRING_EVENT, bump);
  }, []);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const [details, setDetails] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  if (!host?.hasDirect)
    return (
      <SettingsOptionGroup data-testid="web-direct-signer" title="Sign with your desktop">
        <SettingsOptionRow>
          <p className="text-sm font-normal text-muted-foreground/70" data-settings-subcopy>
            Your desktop can sign for this browser over Direct (tailnet). Open Hula Buzz on your desktop, turn on Direct, and
            make sure this device is on the same tailnet; pairing will show up here.
          </p>
        </SettingsOptionRow>
      </SettingsOptionGroup>
    );
  const paired = isPairedWith(host.id);
  const pair = async () => {
    if (!direct) return;
    setBusy(true);
    setDetails(null);
    setCopied(false);
    setNote("Connecting to your desktop… then approve the request there.");
    try {
      const ok = await new DirectSignerClient(direct, host.id).pair(browserLabel());
      setNote(ok ? "Paired. This browser now signs through your desktop while Direct is connected." : "Not approved.");
    } catch (e) {
      const pe = PairingError.from("connect", e);
      setNote(`Pairing didn't finish: ${describePairingError(pe)}`);
      setDetails(pairingDetails(pe, direct.target.url, host.id));
    }
    setBusy(false);
    bump();
  };
  return (
    <SettingsOptionGroup data-testid="web-direct-signer" title="Sign with your desktop">
      <SettingsOptionRow>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            Desktop signer
            <StatusChip tone={paired ? "green" : "grey"} testId="web-direct-signer-chip">
              {paired ? (live ? "Active" : "Paired") : "Not paired"}
            </StatusChip>
          </p>
          <p className="text-sm font-normal text-muted-foreground/70" data-settings-subcopy>
            Tap Pair, then click Allow on your desktop to approve this browser. While Direct is connected, your desktop signs messages, reactions, read markers and synced settings for this
            browser, so you wait less on your phone signer. Your desktop approves this browser once, and you can revoke it
            there. When the desktop isn't reachable, your usual signer is used.
          </p>
          {note && <p className="mt-1 text-sm font-normal text-muted-foreground" data-testid="web-direct-signer-note">{note}</p>}
          {details && (
            <div className="mt-1">
              <pre className="whitespace-pre-wrap break-all text-xs text-muted-foreground/80" data-testid="web-direct-signer-details">{details}</pre>
              <button
                className="text-sm text-muted-foreground underline"
                data-testid="web-direct-signer-copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(details).then(() => setCopied(true), () => setCopied(false));
                }}
                type="button"
              >
                {copied ? "Copied" : "Copy details"}
              </button>
            </div>
          )}
        </div>
        {paired ? (
          <Button data-testid="web-direct-signer-forget" disabled={busy} onClick={() => {
              forgetAndRevoke(host.id, direct ? new DirectSignerClient(direct, host.id) : null);
              setNote(direct ? "Forgotten here and on your desktop." : "Forgotten here. Your desktop will be told the next time Direct connects.");
            }} size="sm" variant="outline">
            Forget
          </Button>
        ) : (
          <Button data-testid="web-direct-signer-pair" disabled={busy || !direct} onClick={() => void pair()} size="sm">
            Pair
          </Button>
        )}
      </SettingsOptionRow>
    </SettingsOptionGroup>
  );
}

/** Diagnostics for a failed pairing (no keys or secrets: step, error, Direct host, browser). */
function pairingDetails(e: PairingError, url: string, desktopId: string): string {
  let host = url;
  try {
    const u = new URL(url);
    host = `${u.protocol}//${u.host}`;
  } catch {
    /* keep raw */
  }
  return [
    `step: ${e.step}${e.stage ? ` / ${e.stage}` : ""}`,
    `error: ${e.code}${e.detail ? ` (${e.detail})` : ""}`,
    `direct: ${host}`,
    `desktop: ${desktopId.slice(0, 12)}`,
    `browser: ${browserLabel()} · ${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
    `standalone: ${typeof matchMedia !== "undefined" && matchMedia("(display-mode: standalone)").matches}`,
    `online: ${typeof navigator !== "undefined" ? navigator.onLine : "?"}`,
    `time: ${new Date().toISOString()}`,
  ].join("\n");
}

const kindName = (k: number) =>
  k < 0 ? "" : ({ 7: "reaction", 9: "message", 40002: "message", 40003: "edit", 40008: "edit", 45001: "post", 45003: "comment", 30078: "app data", 22242: "relay auth", 27235: "HTTP auth" } as Record<number, string>)[k] ?? `kind ${k}`;

/** Desktop: browsers allowed to sign with this computer, their log, revoke. Grouped by how they connect; revoked last. */
export function DesktopDirectSignerCard(props: { empty?: boolean } = {}) {
  const v = React.useSyncExternalStore(subscribeSignerStore, () => localStorage.getItem("buzz-direct-signer-log") ?? "");
  const devices = React.useMemo(() => localSignerStore.devices(), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const log = React.useMemo(() => signerLog(), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = React.useState<string | null>(null);
  const [showRevoked, setShowRevoked] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  if (devices.length === 0)
    return props.empty ? (
      <SettingsOptionGroup data-testid="desktop-direct-signer" title="Browsers that sign with this computer">
        <SettingsOptionRow>
          <p className="text-sm font-normal text-muted-foreground/70" data-settings-subcopy>
            No browsers yet. In the web app, open Settings → Desktop signing and tap Pair; this computer will ask you to Allow.
          </p>
        </SettingsOptionRow>
      </SettingsOptionGroup>
    ) : null;
  const byNewest = (a: SignerDevice, b: SignerDevice) => b.approvedAt - a.approvedAt;
  const active = devices.filter((d) => !d.revokedAt);
  const code = active.filter((d) => d.via === "bunker").sort(byNewest);
  const direct = active.filter((d) => d.via !== "bunker").sort(byNewest);
  const revoked = devices.filter((d) => d.revokedAt).sort((a, b) => (b.revokedAt ?? 0) - (a.revokedAt ?? 0));
  const row = (d: SignerDevice) => {
    const entries = log.filter((e) => e.device === d.pubkey).slice(0, 50);
    const lastUsed = entries.reduce((m, e) => Math.max(m, e.at), 0);
    const sigs = entries.filter((e) => e.kind >= 0 && e.ok).length;
    const info = describeDevice(d.meta, d.label);
    const title = [info.browser, info.os && `on ${info.os}`].filter(Boolean).join(" ");
    return (
      <SettingsOptionRow key={d.pubkey}>
        <div className="min-w-0 flex-1" data-testid="desktop-direct-signer-device">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="break-words">{title || d.label}</span>
            <StatusChip tone={d.revokedAt ? "grey" : "green"}>{d.revokedAt ? "Revoked" : "Allowed"}</StatusChip>
          </p>
          <p className="text-sm font-normal text-muted-foreground/70 break-words" data-settings-subcopy>
            {[info.mode, d.label !== title ? d.label : "", d.meta?.screen].filter(Boolean).join(" · ") || "No device details (paired before they were collected; pair again to fill them in)"}
          </p>
          <p className="text-sm font-normal text-muted-foreground/70 break-words" data-settings-subcopy>
            Approved {new Date(d.approvedAt).toLocaleString()}
            {d.revokedAt ? ` · revoked ${new Date(d.revokedAt).toLocaleString()}` : ""} · last used {lastUsed ? new Date(lastUsed).toLocaleString() : "never"} · {sigs} recent signatures
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground/70">
            <span className="break-all font-mono">device {d.pubkey}</span>
            <button
              className="underline"
              onClick={() => void navigator.clipboard?.writeText(d.pubkey).then(() => setCopied(d.pubkey), () => setCopied(null))}
              type="button"
            >
              {copied === d.pubkey ? "Copied" : "Copy"}
            </button>
          </p>
          <button className="text-sm text-muted-foreground underline" onClick={() => setOpen(open === d.pubkey ? null : d.pubkey)} type="button">
            {open === d.pubkey ? "Hide log" : "Show log"}
          </button>
          {open === d.pubkey && (
            <ul className="mt-1 max-h-48 overflow-auto text-xs text-muted-foreground" data-testid="desktop-direct-signer-log">
              {entries.map((e, i) => (
                <li key={`${e.at}-${i}`}>
                  {new Date(e.at).toLocaleTimeString()} · {e.note ?? kindName(e.kind)}
                  {e.note && e.kind >= 0 ? ` (${kindName(e.kind)})` : ""}
                  {!e.ok && !e.note ? " · not signed" : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
        {!d.revokedAt && (
          <Button data-testid="desktop-direct-signer-revoke" onClick={() => revokeSignerDevice(d.pubkey)} size="sm" variant="outline">
            Revoke
          </Button>
        )}
      </SettingsOptionRow>
    );
  };
  const heading = (text: string, n: number) => (
    <SettingsOptionRow>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {text} ({n})
      </p>
    </SettingsOptionRow>
  );
  return (
    <SettingsOptionGroup data-testid="desktop-direct-signer" title="Browsers that sign with this computer">
      {code.length > 0 && heading("Sign-in code (any network)", code.length)}
      {code.map(row)}
      {direct.length > 0 && heading("Direct", direct.length)}
      {direct.map(row)}
      {revoked.length > 0 && (
        <SettingsOptionRow>
          <button className="text-sm text-muted-foreground underline" data-testid="desktop-direct-signer-revoked-toggle" onClick={() => setShowRevoked(!showRevoked)} type="button">
            {showRevoked ? "Hide" : "Show"} revoked ({revoked.length})
          </button>
        </SettingsOptionRow>
      )}
      {showRevoked && revoked.map(row)}
    </SettingsOptionGroup>
  );
}
