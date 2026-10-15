// Non-secret device details a browser shares when it pairs with the desktop signer (UA, platform, installed-app flag,
// screen). Shown in Settings → Desktop signing so entries are tellable apart. Never keys, tokens or secrets.
export type DeviceMeta = { ua?: string; platform?: string; standalone?: boolean; screen?: string; lang?: string };

/** Web side: gather what the browser already exposes to every site. */
export function collectDeviceMeta(): DeviceMeta {
  try {
    const nav = navigator as Navigator & { standalone?: boolean; userAgentData?: { platform?: string } };
    const standalone =
      (typeof matchMedia !== "undefined" && matchMedia("(display-mode: standalone)").matches) || nav.standalone === true;
    return {
      ua: nav.userAgent,
      platform: nav.userAgentData?.platform || nav.platform || undefined,
      standalone,
      screen: typeof screen !== "undefined" ? `${screen.width}×${screen.height}@${window.devicePixelRatio || 1}x` : undefined,
      lang: nav.language,
    };
  } catch {
    return {};
  }
}

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? [...v].filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join("").slice(0, max) || undefined : undefined;

/** Desktop side: accept only the known fields, short plain strings. */
export function sanitizeDeviceMeta(raw: unknown): DeviceMeta | undefined {
  let o: unknown = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return undefined;
  const r = o as Record<string, unknown>;
  const m: DeviceMeta = {
    ua: clean(r.ua, 300),
    platform: clean(r.platform, 40),
    standalone: typeof r.standalone === "boolean" ? r.standalone : undefined,
    screen: clean(r.screen, 30),
    lang: clean(r.lang, 20),
  };
  return Object.values(m).some((v) => v !== undefined) ? m : undefined;
}

/** "Safari", "iOS 18.6 · iPhone", "Installed app" — best effort from the UA; falls back to the pairing label. */
export function describeDevice(meta: DeviceMeta | undefined, label: string): { browser: string; os: string; mode: string } {
  const ua = meta?.ua ?? "";
  const ios = ua.match(/OS (\d+)[_.](\d+)(?:[_.](\d+))? like Mac OS X/);
  const dev = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Macintosh|Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  let os = "";
  if (ios) os = `${dev === "iPad" ? "iPadOS" : "iOS"} ${ios[1]}.${ios[2]}${ios[3] ? `.${ios[3]}` : ""} · ${dev}`;
  else if (dev === "Android") os = `Android ${ua.match(/Android ([\d.]+)/)?.[1] ?? ""}`.trim();
  else if (dev === "Mac") os = `macOS ${(ua.match(/Mac OS X ([\d_]+)/)?.[1] ?? "").replace(/_/g, ".")}`.trim() + " · Mac";
  else if (dev === "Windows") os = "Windows";
  else if (dev) os = dev;
  const ver = (re: RegExp) => ua.match(re)?.[1];
  const browser = /EdgA?\//.test(ua)
    ? `Edge ${ver(/EdgA?\/([\d]+)/) ?? ""}`
    : /CriOS|Chrome\//.test(ua)
      ? `Chrome ${ver(/(?:CriOS|Chrome)\/([\d]+)/) ?? ""}`
      : /FxiOS|Firefox\//.test(ua)
        ? `Firefox ${ver(/(?:FxiOS|Firefox)\/([\d]+)/) ?? ""}`
        : /Safari\//.test(ua) || ios
          ? `Safari ${ver(/Version\/([\d.]+)/) ?? ""}`
          : "";
  const fromLabel = /app\)/i.test(label);
  const mode =
    meta?.standalone === true || (meta?.standalone === undefined && fromLabel) ? "Installed app (PWA)" : meta?.standalone === false || /\(web\)|on /i.test(label) ? "Browser tab" : "";
  return {
    browser: browser.trim() || label,
    os: os || (meta ? meta.platform ?? "" : ""),
    mode,
  };
}
