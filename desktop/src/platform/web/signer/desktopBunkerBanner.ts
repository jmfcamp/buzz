// Small top banner for the desktop signer route: "desktop offline → signing with Clave" / "read-only" / "revoked".
// Hidden while the desktop answers. Plain DOM (mounted before React), dismissible until the status changes again.
import {
  check,
  desktopBunkerStatus,
  hasDesktopBunker,
  onDesktopBunkerChange,
  type BunkerStatus,
} from "./desktopBunker";

export function startDesktopBunkerBanner(opts: {
  sessionKind: () => string | undefined;
  signInAgain: () => void;
}) {
  let el: HTMLDivElement | null = null;
  let dismissed: BunkerStatus | null = null;
  const hide = () => {
    el?.remove();
    el = null;
  };
  const render = () => {
    const st = desktopBunkerStatus();
    if (st !== dismissed) dismissed = null;
    const desktopOnly = opts.sessionKind() === "desktop";
    let text = "";
    let action: { label: string; run: () => void } | null = null;
    if (st === "offline" && hasDesktopBunker()) {
      text = desktopOnly
        ? "Your desktop isn't reachable, so Buzz is read-only. Open Hula Buzz on your desktop."
        : "Your desktop isn't reachable. Signing with Clave for now.";
      action = { label: "Retry", run: () => void check() };
    } else if (st === "revoked") {
      text = desktopOnly
        ? "Your desktop revoked this browser. Sign in again to send."
        : "Your desktop revoked this browser. Signing with Clave.";
      if (desktopOnly) action = { label: "Sign in", run: opts.signInAgain };
    }
    if (!text || dismissed === st) return hide();
    if (!el) {
      el = document.createElement("div");
      el.setAttribute("data-testid", "desktop-bunker-banner");
      el.setAttribute("role", "status");
      el.style.cssText =
        "position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 8px);z-index:2147483000;max-width:min(92vw,560px);display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 12px;border-radius:10px;background:rgba(30,30,34,.94);color:#fff;font:13px/1.35 system-ui,-apple-system,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.25)";
      document.body.appendChild(el);
    }
    el.replaceChildren();
    const t = document.createElement("span");
    t.textContent = text;
    t.style.cssText = "flex:1 1 220px;min-width:0";
    el.appendChild(t);
    const btn = (label: string, run: () => void, testId: string) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.setAttribute("data-testid", testId);
      b.style.cssText =
        "padding:3px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.35);background:transparent;color:inherit;font:inherit";
      b.onclick = run;
      el?.appendChild(b);
    };
    if (action) btn(action.label, action.run, "desktop-bunker-banner-action");
    btn(
      "✕",
      () => {
        dismissed = st;
        hide();
      },
      "desktop-bunker-banner-dismiss",
    );
  };
  onDesktopBunkerChange(render);
  render();
}
