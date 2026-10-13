// Phone composer collapse/expand, search pinned under the safe area with the keyboard up, web link normalization, linear Back/Forward history.
// Build with VITE_BUZZ_RELAY_URL=ws://localhost:3100 VITE_BUZZ_WEB_PUSH_URL=<any> to S24_DIST; local relay on :3100.
// A TCP proxy on :3101 sits in front of the relay so the test can drop the connection (reconnect pills).
import fs from "node:fs"; import http from "node:http"; import net from "node:net"; import path from "node:path";
import { chromium, devices } from "playwright";
import { installMockExtension } from "./mock-nip07.mjs";
const dist = process.env.S24_DIST || "/tmp/nt-phone-dist";
const out = process.env.S24_OUT || "/workspace/composer-shots";
fs.mkdirSync(out, { recursive: true });
let fakeBuild = null;
const T = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".png":"image/png",".json":"application/json" };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(new URL(q.url,"http://x").pathname);
  if (p === "/version.json" && fakeBuild) { r.writeHead(200,{"Content-Type":"application/json"}); r.end(JSON.stringify({ build: fakeBuild })); return; }
  let f = path.join(dist,p); if (!fs.existsSync(f)||fs.statSync(f).isDirectory()) f = path.join(dist,"index.html"); r.writeHead(200,{"Content-Type":T[path.extname(f)]||"application/octet-stream"}); fs.createReadStream(f).pipe(r); }).listen(4184,"127.0.0.1");
// relay proxy
let socks = new Set(); let up = true;
const proxy = net.createServer((c) => { if (!up) return c.destroy(); const s = net.connect(3100, "127.0.0.1"); socks.add(c); socks.add(s);
  c.pipe(s); s.pipe(c); const end = () => { c.destroy(); s.destroy(); socks.delete(c); socks.delete(s); }; c.on("error", end); s.on("error", end); c.on("close", end); s.on("close", end); }).listen(3104, "127.0.0.1");
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
  }, { relay: "ws://localhost:3104", pk, standalone });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(String(e)));
  await page.goto("http://localhost:4184/");
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
const SHOT = process.env.SHOT || "gap-after";
const measure = (page) => page.evaluate(() => {
  const f = document.querySelector('[data-testid="message-composer"]'); const sc = f.querySelector('[data-testid="message-input-scroll"]');
  const pm = sc.querySelector(".ProseMirror"); const tb = f.querySelector('[data-testid="message-composer-toolbar"]');
  const kids = [...pm.children]; const last = kids[kids.length - 1]; const r = (e) => e.getBoundingClientRect();
  const range = document.createRange(); range.selectNodeContents(pm); const rects = [...range.getClientRects()].filter((x) => x.height > 0);
  const textBottom = Math.max(...rects.map((x) => x.bottom)); const cs = (e) => getComputedStyle(e);
  return { gap: Math.round(r(tb).top - Math.min(textBottom, r(sc).bottom)), scH: Math.round(r(sc).height), pmH: Math.round(r(pm).height),
    scrollable: sc.scrollHeight > sc.clientHeight + 1, kids: kids.map((k) => k.tagName + (k.textContent ? "" : "(empty)")).join(","),
    pmMin: cs(pm).minHeight, pmPad: cs(pm).paddingBottom, scMin: cs(sc).minHeight, scPad: cs(sc).paddingBottom, lastMb: last && cs(last).marginBottom,
    tbMt: cs(tb).marginTop, tbPt: cs(tb).paddingTop };
});
{
  const { b, page, errs } = await openPhone();
  await page.locator('[data-testid="phone-channels-screen"] [data-testid="channel-general"]').first().tap(); await page.waitForTimeout(2000);
  await page.locator('[data-testid="message-input"]').tap(); await page.waitForTimeout(400);
  await page.keyboard.type("one line"); await page.waitForTimeout(200);
  if (process.env.PROBE) console.log("PROBE", await page.evaluate(() => { const f = document.querySelector('[data-testid="message-composer"]'); const sc = f.querySelector('[data-testid="message-input-scroll"]'); const tb = f.querySelector('[data-testid="message-composer-toolbar"]');
    const out = []; const walk = (e, d) => { if (d > 3) return; const r = e.getBoundingClientRect(); const c = getComputedStyle(e); out.push(`${"-".repeat(d)}${e.tagName}.${(e.className||"").toString().slice(0,60)} [${e.dataset.testid||""}] top=${Math.round(r.top)} h=${Math.round(r.height)} pt=${c.paddingTop} mt=${c.marginTop} minh=${c.minHeight}`); for (const k of e.children) walk(k, d + 1); };
    let n = sc; while (n && !n.contains(tb)) { for (let x = n.nextElementSibling; x; x = x.nextElementSibling) { const r = x.getBoundingClientRect(); out.push(`SIB ${x.tagName}.${(x.className||"").toString().slice(0,80)} [${x.dataset.testid||""}] top=${Math.round(r.top)} h=${Math.round(r.height)} mt=${getComputedStyle(x).marginTop} pt=${getComputedStyle(x).paddingTop}`); if (x.contains(tb)) break; } n = n.parentElement; out.push("UP " + n?.tagName + "." + (n?.className||"").toString().slice(0,80) + " pb=" + getComputedStyle(n).paddingBottom + " gap=" + getComputedStyle(n).rowGap); }
    out.push("scroll bottom=" + Math.round(sc.getBoundingClientRect().bottom)); walk(tb, 0); return out.join("\n"); }));
  const m1 = await measure(page); console.log("1 line", JSON.stringify(m1));
  check("1 line: toolbar ~8px below the text", m1.gap >= 2 && m1.gap <= 10, String(m1.gap));
  for (let i = 2; i <= 5; i++) { await page.keyboard.press("Shift+Enter"); await page.keyboard.type(`line ${i}`); }
  await page.waitForTimeout(200);
  const m5 = await measure(page); console.log("5 lines", JSON.stringify(m5));
  check("5 lines: grows to fit, toolbar ~8px below the last line", m5.gap >= 2 && m5.gap <= 10 && !m5.scrollable, String(m5.gap));
  await page.screenshot({ path: `${out}/${SHOT}-390x844.png` });
  for (let i = 6; i <= 14; i++) { await page.keyboard.press("Shift+Enter"); await page.keyboard.type(`line ${i}`); }
  await page.waitForTimeout(200);
  const mx = await measure(page); console.log("14 lines", JSON.stringify(mx));
  check("overflow: capped at max height and scrolls", mx.scrollable && mx.scH <= 200 && mx.gap >= 0 && mx.gap <= 14, `${mx.scH} ${mx.gap}`);
  await page.screenshot({ path: `${out}/${SHOT}-overflow-390x844.png` });
  check("no page errors", errs.length === 0, errs.join(" | ").slice(0, 300));
  await b.close();
}
console.log(`${res.filter(Boolean).length}/${res.length} passed`);
srv.close(); proxy.close(); process.exit(res.every(Boolean) ? 0 : 1);
