// Settings: "desktop as signer over Direct". Web: pair this browser with the desktop. Desktop: approved browsers,
// their signing log, and revoke. No keys are shown or exported anywhere; only device PUBLIC keys are listed.
import * as React from "react";
import { SettingsOptionGroup, SettingsOptionRow } from "@/features/settings/ui/SettingsOptionGroup";
import { Button } from "@/shared/ui/button";
import { getProxyDirect } from "../remoteCmd";
import { revokeSignerDevice, localSignerStore, signerLog, subscribeSignerStore } from "../directSigner";
import { DirectSignerClient, forgetPairing, isPairedWith } from "../directSignerClient";
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
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
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
    setNote("Approve the request on your desktop…");
    try {
      const ok = await new DirectSignerClient(direct, host.id).pair(browserLabel());
      setNote(ok ? "Paired. This browser now signs through your desktop while Direct is connected." : "Not approved.");
    } catch {
      setNote("Pairing didn't finish. Check that your desktop is on and connected, then try again.");
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
            <StatusChip tone={paired ? (live ? "green" : "grey") : "grey"} testId="web-direct-signer-chip">
              {paired ? (live ? "Active" : "Paired") : "Not paired"}
            </StatusChip>
          </p>
          <p className="text-sm font-normal text-muted-foreground/70" data-settings-subcopy>
            Tap Pair, then click Allow on your desktop to approve this browser. While Direct is connected, your desktop signs messages, reactions, read markers and synced settings for this
            browser, so you wait less on your phone signer. Your desktop approves this browser once, and you can revoke it
            there. When the desktop isn't reachable, your usual signer is used.
          </p>
          {note && <p className="mt-1 text-sm font-normal text-muted-foreground" data-testid="web-direct-signer-note">{note}</p>}
        </div>
        {paired ? (
          <Button data-testid="web-direct-signer-forget" disabled={busy} onClick={() => (forgetPairing(host.id), bump())} size="sm" variant="outline">
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

const kindName = (k: number) =>
  k < 0 ? "" : ({ 7: "reaction", 9: "message", 40002: "message", 40003: "edit", 40008: "edit", 45001: "post", 45003: "comment", 30078: "app data", 22242: "relay auth", 27235: "HTTP auth" } as Record<number, string>)[k] ?? `kind ${k}`;

/** Desktop: browsers allowed to sign with this computer, their log, revoke. */
export function DesktopDirectSignerCard(props: { empty?: boolean } = {}) {
  const v = React.useSyncExternalStore(subscribeSignerStore, () => localStorage.getItem("buzz-direct-signer-log") ?? "");
  const devices = React.useMemo(() => localSignerStore.devices(), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const log = React.useMemo(() => signerLog(), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = React.useState<string | null>(null);
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
  return (
    <SettingsOptionGroup data-testid="desktop-direct-signer" title="Browsers that sign with this computer">
      {devices.map((d) => {
        const entries = log.filter((e) => e.device === d.pubkey).slice(0, 50);
        return (
          <SettingsOptionRow key={d.pubkey}>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                {d.label}
                <StatusChip tone={d.revokedAt ? "grey" : "green"}>{d.revokedAt ? "Revoked" : "Allowed"}</StatusChip>
              </p>
              <p className="text-sm font-normal text-muted-foreground/70" data-settings-subcopy>
                Device {d.pubkey.slice(0, 12)}… · approved {new Date(d.approvedAt).toLocaleString()} · {entries.filter((e) => e.kind >= 0 && e.ok).length} recent signatures
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
      })}
    </SettingsOptionGroup>
  );
}
