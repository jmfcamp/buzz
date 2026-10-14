// Web cold start via the paired desktop: remember the last desktop this browser used as signer (public info only: desktop
// id + Direct URL; the device key stays where directSignerClient keeps it) so the next launch can open Direct first,
// authenticated by the device key (no remote-signer round trip), and sign the relay's NIP-42 AUTH there.
import { setDirectSigner, desktopSignerActive, getDirectRoute } from "@/platform/web/signer/directRoute";
import { directAgentsFor } from "./directAgents";
import { DirectSignerClient, isPairedWith } from "./directSignerClient";
import type { SignJson } from "./remoteClient";

const KEY = "buzz-direct-last-desktop";
type Last = { desktopId: string; url: string };

export function rememberDesktop(desktopId: string, url: string) {
  try {
    if (!isPairedWith(desktopId)) return;
    localStorage.setItem(KEY, JSON.stringify({ desktopId, url } satisfies Last));
  } catch {
    /* storage unavailable */
  }
}
function lastDesktop(): Last | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null") as Last | null;
    if (v && typeof v.desktopId === "string" && typeof v.url === "string" && /^https:\/\//.test(v.url) && isPairedWith(v.desktopId)) return v;
  } catch {
    /* fall through */
  }
  return null;
}

let attempt: Promise<boolean> | null = null;
/**
 * Try to bring up Direct to the last paired desktop within `timeoutMs`. Registers it as the desktop signer (the React
 * bridge later re-registers the same shared client). Resolves true when the desktop can sign now.
 */
export function warmDesktopSigner(sign: SignJson, timeoutMs = 6000): Promise<boolean> {
  if (desktopSignerActive()) return Promise.resolve(true);
  const last = lastDesktop();
  if (!last) return Promise.resolve(false);
  attempt ??= (async () => {
    try {
      const agents = directAgentsFor({ desktopId: last.desktopId, url: last.url }, sign);
      if (!getDirectRoute()) {
        const c = new DirectSignerClient(agents, last.desktopId);
        setDirectSigner({ sign: (ev) => c.sign(ev), active: () => c.active(), isAuto: (k) => c.isAuto(k), crypt: (op, peer, text) => c.crypt(op, peer, text), isPaired: () => c.isPaired() });
      }
      await Promise.race([agents.connect(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs))]);
      return desktopSignerActive();
    } catch {
      return false;
    } finally {
      attempt = null;
    }
  })();
  return attempt;
}
