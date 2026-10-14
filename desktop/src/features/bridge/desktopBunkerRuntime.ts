// Desktop: the one bunker instance for this app (policy + relay service), shared by the AppShell hook and Settings.
// The relay socket is only open while a sign-in code is showing or a browser is paired through it.
import * as React from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  createBunkerPolicy,
  createBunkerService,
  bunkerTransportSecret,
  type BunkerPolicyDeps,
} from "./desktopBunker";
import {
  localSignerStore,
  subscribeSignerStore,
  type SignerDeps,
} from "./directSigner";

type Runtime = {
  policy: ReturnType<typeof createBunkerPolicy>;
  service: ReturnType<typeof createBunkerService>;
};
let rt: Runtime | null = null;
let connected = false;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export function initDesktopBunker(
  deps: Omit<BunkerPolicyDeps, "store" | "now" | "randomHex"> &
    Pick<SignerDeps, "randomHex">,
) {
  if (rt || !isTauri()) return;
  const policy = createBunkerPolicy({
    ...deps,
    store: localSignerStore,
    now: Date.now,
  });
  const service = createBunkerService({
    policy,
    secretKey: bunkerTransportSecret(),
    onStatus: (s) => {
      connected = s.connected;
      emit();
    },
  });
  rt = { policy, service };
  subscribeSignerStore(sync);
  sync();
}
/** Open or close the relay socket to match whether anything needs it. */
export function sync() {
  if (!rt) return;
  if (rt.policy.wanted()) rt.service.start();
  else rt.service.stop();
  emit();
}
export function desktopBunkerAvailable() {
  return !!rt;
}
/** New one-time sign-in code for a browser: { uri, expiresAt }. */
export function newSignInCode(): { uri: string; expiresAt: number } | null {
  if (!rt) return null;
  const c = rt.policy.newCode();
  sync();
  setTimeout(sync, c.expiresAt - Date.now() + 500); // close the socket again if nobody used it
  return { uri: rt.service.uriFor(c.secret), expiresAt: c.expiresAt };
}
export function cancelSignInCode() {
  rt?.policy.cancelCode();
  sync();
}
export function codeStillActive() {
  return !!rt?.policy.activeCode();
}
export function bunkerConnected() {
  return connected;
}
export function useDesktopBunkerState() {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    listeners.add(bump);
    return () => void listeners.delete(bump);
  }, []);
  return {
    available: desktopBunkerAvailable(),
    connected,
    codeActive: codeStillActive(),
  };
}
