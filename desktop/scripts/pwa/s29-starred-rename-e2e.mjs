import { chromium } from "playwright";
import { installMockExtension } from "./mock-nip07.mjs";
const TYLER = "3dbaebadb5dfd777ff25149ee230d907a15a9e1294b40b830661e65bb42f6c03";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const { pk } = await installMockExtension(ctx, TYLER);
await ctx.addInitScript(({ relay, pk }) => {
  if (!localStorage.getItem("buzz-communities")) {
    localStorage.setItem("buzz-communities", JSON.stringify([{ id: "c1", name: "Local Dev", relayUrl: relay, pubkey: pk, addedAt: new Date().toISOString() }]));
    localStorage.setItem("buzz-active-community-id", "c1");
  }
  const root = "a".repeat(64);
  localStorage.setItem(`buzz-thread-stars.v1:${pk}`, JSON.stringify({ version: 1, threads: { [root]: { rootId: root, channelId: "chan1", title: "Hello thread", channelName: "general", starredAt: 1 } } }));
}, { relay: "ws://localhost:3100", pk });
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => { const t = m.text(); if (/RTRACE|Error|error/.test(t)) logs.push(`${Date.now()} ${m.type()}: ${t.slice(0, 1500)}`); });
page.on("pageerror", (e) => logs.push(`PAGEERROR ${e.message}\n${e.stack}`));
await page.goto("http://127.0.0.1:5199/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="web-unlock-nip07"]', { timeout: 30000 });
await page.click('[data-testid="web-unlock-nip07"]');
await page.waitForSelector('[data-testid="app-top-chrome"]', { timeout: 40000 });
const row = page.locator('[data-testid^="starred-thread-"]').first();
await row.waitFor({ timeout: 20000 });
logs.push(`${Date.now()} --- right-click`);
await row.click({ button: "right" });
await page.locator('[data-testid^="starred-thread-rename-"]').click();
logs.push(`${Date.now()} --- clicked Rename`);
const s = [];
for (let i = 0; i < 10; i++) { s.push(await page.locator('[data-testid="thread-rename-dialog"]').isVisible().catch(() => false)); await page.waitForTimeout(150); }
console.log("VISIBLE", JSON.stringify(s));
await page.screenshot({ path: "/tmp/repro-full.png" });
if (s.at(-1)) {
  await page.fill('[data-testid="thread-rename-name"]', "Renamed full");
  await page.click('[data-testid="thread-rename-save"]');
  await page.waitForTimeout(500);
  console.log("ROWTEXT", await page.locator('[data-testid="starred-threads-list"]').innerText());
}
console.log(logs.join("\n"));
await browser.close();
