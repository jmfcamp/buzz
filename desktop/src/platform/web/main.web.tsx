// Web entry: register SW (prod only), unlock via signer (NIP-07), then boot the shared desktop app.
import "./web.css";
import { getSession, probeActiveSigner, resumeSession, signOutSigner, signerPubkey } from "./signer";
import { ensureSignerAwake, startBackgroundSignerCheck, startSignerBanner, type SignerActions } from "./signer/signerOverlay";
import { startBootWatch } from "./signer/bootWatch";
import { sendStatus } from "@/shared/lib/sendStatus";
import { isStaleChunkError, reloadForStaleBuild } from "@/shared/lib/lazyWithReload";
import { setWebDocumentTitle } from "./documentTitle";

// iOS Add to Home Screen uses document.title; keep it HulaBuzz (desktop Tauri uses productName).
setWebDocumentTitle();

// A chunk from the previous deploy is gone: reload once onto the new build instead of failing a lazy screen.
window.addEventListener("vite:preloadError", (e) => {
  if (reloadForStaleBuild()) e.preventDefault();
});
// Lazy screens outside the router (React.lazy, dynamic import()) that fail the same way: one guarded reload too.
window.addEventListener("unhandledrejection", (e) => {
  if (isStaleChunkError(e.reason) && reloadForStaleBuild()) e.preventDefault();
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch((e) => console.warn("sw register failed", e));
  });
}
// Slow remote signers: failed sends stay visible as "Failed — Retry" instead of silently rolling back.
sendStatus.configure({ keepFailedRows: true });
startBootWatch(signOutSigner);
const signerActions: SignerActions = {
  probe: (onAttempt) => probeActiveSigner(15000, onAttempt),
  reconnect: async () => {
    const before = signerPubkey();
    const { showUnlockOverlay } = await import("./UnlockScreen");
    const pk = await showUnlockOverlay();
    if (before && pk !== before) location.reload(); // a different account: restart cleanly
  },
  signOut: () => signOutSigner(),
};
if (!(await resumeSession())) {
  const { showUnlock } = await import("./UnlockScreen");
  await showUnlock();
}
// No blocking boot gate for a saved NIP-46 session: iOS suspends a backgrounded signer app (Clave), so a startup ping
// would dead-end on every reload/update. The cached session boots straight in (reads need no signer), signing is lazy,
// the paired desktop signs over Direct first, and a quiet background check raises the non-blocking banner if needed.
startSignerBanner(signerActions);
if (getSession()?.kind === "nip46") {
  startBackgroundSignerCheck(signerActions);
  const { setRelayPreConnectHook } = await import("@/shared/api/relayClientSession");
  setRelayPreConnectHook(() => ensureSignerAwake(signerActions));
}
void import("./updateCheck").then((m) => m.startUpdateCheck()).catch(() => undefined);
void import("./permissionPrompts").then((m) => m.startPermissionPrompts()).catch(() => undefined);
if (import.meta.env.VITE_BUZZ_WEB_PUSH_URL) void import("./push/banner").then((m) => m.startWebPush()).catch(() => undefined);
try {
  await import("@/main");
} catch (e) {
  // A failed chunk/module import (stale bundle, dev reload on iOS) used to leave a blank page: show the error and a Reload.
  console.error("[web] app failed to load", e);
  const root = document.getElementById("root") ?? document.body;
  const box = document.createElement("div");
  box.setAttribute("data-testid", "web-boot-error");
  box.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;height:100vh;padding:24px;font:14px system-ui;text-align:center";
  const t = document.createElement("p");
  t.textContent = "Buzz failed to load";
  t.style.fontWeight = "600";
  const m = document.createElement("pre");
  m.textContent = e instanceof Error ? e.message : String(e);
  m.style.cssText = "max-width:28rem;white-space:pre-wrap;word-break:break-word;font-size:12px;opacity:.8";
  const b = document.createElement("button");
  b.textContent = "Reload";
  b.style.cssText = "padding:8px 16px;border:1px solid #888;border-radius:6px";
  b.onclick = () => location.reload();
  box.append(t, m, b);
  root.replaceChildren(box);
}
