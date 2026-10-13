// Web: a calm "Sign with your desktop" nudge (same status host and behavior as the notifications banner) when this browser
// can reach a desktop over Direct but isn't paired yet. Hidden for good once paired. "Hide" lasts only for this app session:
// every load/reload shows it again while the desktop is reachable and this browser is unpaired.
import * as React from "react";
import { clearStatus, showStatus } from "@/shared/ui/statusPills";
import type { DirectAgents } from "../directAgents";
import { DirectSignerClient, isPairedWith } from "../directSignerClient";

const ID = "direct-signer-banner";
const dismissedThisSession = new Set<string>(); // in memory only: cleared on every load/reload
const lastReachable = new Map<string, boolean>();

/** Direct went from unreachable to reachable while the app is open: show the nudge again even if hidden earlier this
 *  session (once per transition, not repeatedly while it stays reachable). */
export function noteReachability(desktopId: string, reachable: boolean) {
  const before = lastReachable.get(desktopId);
  lastReachable.set(desktopId, reachable);
  if (reachable && before === false) dismissedThisSession.delete(desktopId);
}

export function browserLabel(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const dev = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : "Computer";
  const br = /CriOS|Chrome/.test(ua) ? "Chrome" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "Browser";
  return `${br} on ${dev}`;
}

/** Should the nudge show for this desktop right now? */
export function shouldShowSignerNudge(desktopId: string, reachable: boolean): boolean {
  return reachable && !isPairedWith(desktopId) && !dismissedThisSession.has(desktopId);
}

export function useDirectSignerBanner(direct: DirectAgents | null, desktopId: string | undefined, reachable: boolean) {
  const [tick, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (desktopId) noteReachability(desktopId, reachable);
    if (!direct || !desktopId || !shouldShowSignerNudge(desktopId, reachable)) {
      clearStatus(ID);
      return;
    }
    let busy = false;
    const base = {
      tone: "action" as const,
      title: "Sign with your desktop",
      testId: "direct-signer-banner",
      onHide: () => {
        dismissedThisSession.add(desktopId);
        clearStatus(ID);
      },
    };
    const show = (description: string, withPair = true) =>
      showStatus(ID, {
        ...base,
        description,
        action: withPair ? { label: "Pair", testId: "direct-signer-pair", onClick: () => void pair() } : undefined,
      });
    const pair = async () => {
      if (busy) return;
      busy = true;
      show("Now click Allow on your desktop to approve this browser.", false);
      try {
        const ok = await new DirectSignerClient(direct, desktopId).pair(browserLabel());
        if (ok) {
          clearStatus(ID);
          bump();
        } else show("Not approved on your desktop. Tap Pair to try again.");
      } catch {
        show("Pairing didn't finish. Make sure your desktop is on and connected, then tap Pair.");
      } finally {
        busy = false;
      }
    };
    show("Your desktop can sign messages for this browser, so you wait less on your phone signer. Tap Pair, then click Allow on your desktop.");
    return () => clearStatus(ID);
  }, [direct, desktopId, reachable, tick]);
}
