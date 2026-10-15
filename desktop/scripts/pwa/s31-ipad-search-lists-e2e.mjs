// iPad: top-chrome Search opens search with the left panel closed; Assist Chat/Lists tabs respond to taps.
// Narrow iPad (< 768px: portrait mini, Split View, Stage Manager) uses the modal sidebar sheet — the regression case.
// Needs the web dev server on :5199 and a relay on :3100 (real, or `node scripts/pwa/mock-relay.mjs`).
// Usage: node scripts/pwa/s31-ipad-search-lists-e2e.mjs [chromium|webkit]
import { chromium, webkit } from "playwright";
import { installMockExtension } from "./mock-nip07.mjs";
const engine = process.argv[2] === "webkit" ? webkit : chromium;
const TYLER = "3dbaebadb5dfd777ff25149ee230d907a15a9e1294b40b830661e65bb42f6c03";
const SIZES = [[744, 1133], [700, 900], [1024, 1366], [1180, 820]];
const browser = await engine.launch();
const failures = [];
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: engine === chromium });
  const { pk } = await installMockExtension(ctx, TYLER);
  await ctx.addInitScript(({ relay, pk }) => {
    if (!localStorage.getItem("buzz-communities")) {
      localStorage.setItem("buzz-communities", JSON.stringify([{ id: "c1", name: "Local Dev", relayUrl: relay, pubkey: pk, addedAt: new Date().toISOString() }]));
      localStorage.setItem("buzz-active-community-id", "c1");
    }
  }, { relay: "ws://localhost:3100", pk });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => failures.push(`${w}x${h} PAGEERROR ${e.message}`));
  await page.goto("http://127.0.0.1:5199/");
  await page.waitForSelector('[data-testid="web-unlock-nip07"]', { timeout: 60000 });
  await page.click('[data-testid="web-unlock-nip07"]');
  await page.waitForTimeout(3000);
  if (await page.getByText("What should we call you").count()) {
    await page.locator("input").first().fill("Tyler");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForTimeout(3000);
  }
  await page.waitForSelector('[data-testid="global-search"]', { timeout: 30000 });
  const r = { size: `${w}x${h}` };
  // Close the left panel on wide layouts (narrow ones start with the sheet closed).
  const sheetMode = w < 768;
  if (!sheetMode) { await page.getByRole("button", { name: "Toggle Sidebar" }).first().tap(); await page.waitForTimeout(600); }
  await page.locator('[data-testid="global-search"]').tap();
  await page.waitForTimeout(1200);
  r.searchDialogs = await page.locator('[data-testid="search-results"]:visible').count();
  r.searchFocused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Search everything");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {
    ok = await page.evaluate(async ([me, a]) => (await import("/src/features/inbox/assistantPick.ts")).setSyncedAssistant(me, a), [pk, "b".repeat(64)]);
    if (!ok) await page.waitForTimeout(500);
  }
  await page.getByRole("button", { name: "Toggle Sidebar" }).first().tap();
  await page.waitForTimeout(800);
  await page.locator('[data-testid="sidebar-assist-button"]').tap({ timeout: 5000 }).catch(() => failures.push(`${r.size}: sidebar Assist not tappable`));
  await page.waitForTimeout(1000);
  r.sheetOpenAfterAssist = await page.locator('[data-sidebar="sidebar"][data-mobile="true"]').count();
  const tap = async (id) => { const b = await page.locator(`[data-testid="${id}"]`).boundingBox().catch(() => null); if (!b) { failures.push(`${r.size}: ${id} not visible`); return; } await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(600); };
  await tap("web-assistant-tab-chat");
  await tap("web-assistant-tab-lists");
  r.listsSelected = await page.locator('[data-testid="web-assistant-tab-lists"]').getAttribute("aria-selected");
  r.listsShown = await page.locator('[data-testid="web-assistant-lists"]').isVisible().catch(() => false);
  await tap("web-assistant-tab-chat");
  r.chatSelected = await page.locator('[data-testid="web-assistant-tab-chat"]').getAttribute("aria-selected");
  await page.screenshot({ path: `/tmp/s31-${w}x${h}.png` });
  console.log("RESULT", JSON.stringify(r));
  if (r.searchDialogs !== 1) failures.push(`${r.size}: search dialogs=${r.searchDialogs}`);
  if (!r.searchFocused) failures.push(`${r.size}: search input not focused`);
  if (r.sheetOpenAfterAssist) failures.push(`${r.size}: sidebar sheet still open over Assist`);
  if (r.listsSelected !== "true" || !r.listsShown) failures.push(`${r.size}: Lists tap ignored`);
  if (r.chatSelected !== "true") failures.push(`${r.size}: Chat tap ignored`);
  await ctx.close();
}
await browser.close();
console.log(failures.length ? `FAIL\n${failures.join("\n")}` : "PASS");
process.exit(failures.length ? 1 : 0);
