// Phone Inbox count: web default on (migrates prefs saved before #244), read baseline v2, Settings choice sticks.
// Build with VITE_BUZZ_RELAY_URL=ws://localhost:3100 VITE_BUZZ_WEB_PUSH_URL=<any> to S24_DIST; local relay on :3100.
// A TCP proxy on :3101 sits in front of the relay so the test can drop the connection (reconnect pills).
import fs from "node:fs"; import http from "node:http"; import net from "node:net"; import path from "node:path";
import { chromium, devices } from "playwright";
import { installMockExtension } from "./mock-nip07.mjs";
const dist = process.env.S24_DIST || "/tmp/nt-phone-dist";
const out = process.env.S24_OUT || "/workspace/inbox-shots";
fs.mkdirSync(out, { recursive: true });
let fakeBuild = null;
const T = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".png":"image/png",".json":"application/json" };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url,"http://x").pathname);
  if (p === "/version.json" && fakeBuild) { r.writeHead(200,{"Content-Type":"application/json"}); r.end(JSON.stringify({ build: fakeBuild })); return; }
  let f = path.join(dist,p); if (!fs.existsSync(f)||fs.statSync(f).isDirectory()) f = path.join(dist,"index.html"); r.writeHead(200,{"Content-Type":T[path.extname(f)]||"application/octet-stream"}); fs.createReadStream(f).pipe(r); }).listen(4183,"127.0.0.1");
// relay proxy
let socks = new Set(); let up = true;
const proxy = net.createServer((c) => { if (!up) return c.destroy(); const s = net.connect(3100, "127.0.0.1"); socks.add(c); socks.add(s);
  c.pipe(s); s.pipe(c); const end = () => { c.destroy(); s.destroy(); socks.delete(c); socks.delete(s); }; c.on("error", end); s.on("error", end); c.on("close", end); s.on("close", end); }).listen(3103, "127.0.0.1");
const drop = () => { up = false; for (const x of socks) x.destroy(); socks.clear(); };
const restore = () => { up = true; };

const SK = "3dbaebadb5dfd777ff25149ee230d907a15a9e1294b40b830661e65bb42f6c03";
const res = []; const check = (n, ok, d="") => { res.push(!!ok); console.log(`${ok?"PASS":"FAIL"} ${n}${d?" — "+d:""}`); };
const PHONE = { ...devices["iPhone 14"], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2,
  userAgent: devices["iPhone 14"].userAgent.replace("OS 16_0", "OS 18_0") };
delete PHONE.defaultBrowserType;
async function open({ standalone = true, delay = 0, permissions = [] } = {}) {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...PHONE, permissions });
  const { pk } = await installMockExtension(ctx, SK, { delay });
  await ctx.addInitScript(({ relay, pk, standalone }) => {
    // iOS standalone behavior: permission starts "default"; after Allow, requestPermission() resolves "granted" but
    // Notification.permission keeps reading "default" (the lag that kept the banner up).
    if (window.Notification) {
      let answered = null;
      Object.defineProperty(Notification, "permission", { get: () => (window.__permLive ? answered ?? "default" : "default"), configurable: true });
      Notification.requestPermission = async () => { answered = "granted"; return "granted"; };
    }
    localStorage.setItem("buzz-communities", JSON.stringify([{ id: "c1", name: "Local Dev", relayUrl: relay, pubkey: pk, addedAt: new Date().toISOString() }]));
    localStorage.setItem("buzz-active-community-id", "c1");
    if (standalone) {
      Object.defineProperty(navigator, "standalone", { value: true });
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => /display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : mm(q);
    }
  }, { relay: "ws://localhost:3103", pk, standalone });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto("http://localhost:4183/");
  await page.click('[data-testid="web-unlock-nip07"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="phone-tabbar"], [data-testid="app-top-chrome"]', { timeout: 30000 });
  await page.waitForTimeout(4000);
  return { b, ctx, page, errs };
}
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
const navState = (page) => page.evaluate(() => {
  const q = (id) => document.querySelector(`[data-testid="${id}"]`);
  const r = (el) => el?.getBoundingClientRect();
  return { row: !!q("phone-nav-row"), back: q("phone-nav-back")?.disabled, fwd: q("phone-nav-forward")?.disabled,
    rowTop: r(q("phone-nav-row"))?.top, rowH: r(q("phone-nav-row"))?.height, pill: r(q("phone-tab-switcher")),
    pathOk: true, labeled: !!document.querySelector(".phone-back-button, [data-testid='phone-back'], [data-testid='settings-back-to-app']"),
    path: location.hash };
});

const SAFE_TOP = 47;
async function openPhone() {
  const r = await open();
  await r.page.evaluate((t) => { const s = document.createElement("style"); s.textContent = `:root{--phone-safe-top:${t}px !important}`; document.head.appendChild(s); }, SAFE_TOP);
  await r.page.evaluate(() => document.querySelector('[data-testid="status-host"]')?.remove());
  await r.page.waitForTimeout(300);
  return r;
}
const PREFS = "buzz.appearance.sidebarMenuCountPrefs";
{
  // A PWA that saved its count prefs before #244 (inbox off) and has a v1 floor saved at first login.
  const b0 = await chromium.launch(); await b0.close();
  const r = await (async () => {
    const x = await open({});
    return x;
  })();
  const { page, errs, ctx, b } = r;
  // simulate the pre-#244 state on this origin, then reload as the app would on next launch
  await page.evaluate((k) => { localStorage.setItem(k, JSON.stringify({ inbox: false, browsers: false, agents: false, bots: false }));
    localStorage.removeItem(k + ".webInboxOn.v1");
    for (const key of Object.keys(localStorage)) if (key.startsWith("buzz.read-baseline.")) localStorage.removeItem(key);
    localStorage.setItem("buzz.read-baseline.v1:" + "f".repeat(64), String(Math.floor(Date.now() / 1000))); }, PREFS);
  await page.reload(); await page.click('[data-testid="web-unlock-nip07"]', { timeout: 30000 }).catch(() => {});
  await page.waitForSelector('[data-testid="phone-tabbar"]', { timeout: 30000 }); await page.waitForTimeout(5000);
  const st = await page.evaluate((k) => ({ prefs: JSON.parse(localStorage.getItem(k) || "{}"), mig: localStorage.getItem(k + ".webInboxOn.v1"),
    v2: Object.keys(localStorage).filter((x) => x.startsWith("buzz.read-baseline.v2:")).map((x) => Number(localStorage.getItem(x))),
    badge: document.querySelector('[data-testid="phone-tab-inbox"] [data-testid="phone-tab-badge"]')?.textContent ?? null }), PREFS);
  check("pre-#244 'inbox: false' migrates to on once (web default)", st.prefs.inbox === true && st.mig === "1", JSON.stringify(st));
  check("read baseline is recomputed under the v2 key (v1 floors ignored)", st.v2.length >= 1 && st.v2.every((v) => v > 0 && v <= Date.now() / 1000 + 60), JSON.stringify(st.v2));
  await shot(page, "inbox-tabbar-390x844");
  // a deliberate off in Settings after the migration sticks across reloads
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ inbox: false, browsers: false, agents: false, bots: false })), PREFS);
  await page.reload(); await page.click('[data-testid="web-unlock-nip07"]', { timeout: 30000 }).catch(() => {});
  await page.waitForSelector('[data-testid="phone-tabbar"]', { timeout: 30000 }); await page.waitForTimeout(2000);
  const off = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}").inbox, PREFS);
  check("a later choice (off) is respected — the migration runs once", off === false, String(off));
  check("no page errors", errs.length === 0, errs.join(" | ").slice(0, 300));
  await b.close();
}
console.log(`${res.filter(Boolean).length}/${res.length} passed`);
srv.close(); proxy.close(); process.exit(res.every(Boolean) ? 0 : 1);
