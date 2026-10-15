// Web/PWA: keep Radix popovers, menus and pickers inside the safe area (status bar / Dynamic Island, home indicator)
// and above the phone tab bar. Desktop (Tauri) returns undefined, so Radix keeps its defaults there.
import { isTauri } from "@tauri-apps/api/core";

type Pad = { top: number; right: number; bottom: number; left: number };
const GAP = 8;
let cached: Pad | null = null;
let installed = false;

function measure(): Pad {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const px = (v: string) => Number.parseFloat(v) || 0;
  const pad = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
  probe.remove();
  return pad;
}

function tabBarHeight(): number {
  const bar = document.querySelector('[data-testid="phone-tabbar"]');
  if (!bar || getComputedStyle(bar).display === "none") return 0;
  return Math.max(0, window.innerHeight - bar.getBoundingClientRect().top);
}

export function webCollisionPadding(): Pad | undefined {
  if (typeof window === "undefined" || isTauri()) return undefined;
  if (!installed) {
    installed = true;
    const reset = () => {
      cached = null;
    };
    window.addEventListener("resize", reset);
    window.addEventListener("orientationchange", reset);
  }
  cached ??= measure();
  const bottom = Math.max(cached.bottom, tabBarHeight());
  return {
    top: cached.top + GAP,
    right: cached.right + GAP,
    bottom: bottom + GAP,
    left: cached.left + GAP,
  };
}
