// Assist popup uses the shared MessageComposer: one row on phone until focused, full toolbar when focused, typing slot below.
import { chromium } from "playwright";
import { installMockExtension } from "./mock-nip07.mjs";
const TYLER = "3dbaebadb5dfd777ff25149ee230d907a15a9e1294b40b830661e65bb42f6c03";
const AGENT = "b".repeat(64);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const { pk } = await installMockExtension(ctx, TYLER);
await ctx.addInitScript(({ relay, pk }) => {
  if (!localStorage.getItem("buzz-communities")) {
    localStorage.setItem("buzz-communities", JSON.stringify([{ id: "c1", name: "Local Dev", relayUrl: relay, pubkey: pk, addedAt: new Date().toISOString() }]));
    localStorage.setItem("buzz-active-community-id", "c1");
  }
}, { relay: "ws://localhost:3100", pk });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(`PAGEERROR ${e.message}`));
await page.goto("http://127.0.0.1:5199/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="web-unlock-nip07"]', { timeout: 30000 });
await page.click('[data-testid="web-unlock-nip07"]');
await page.waitForTimeout(4000);
let ok = false;
for (let i = 0; i < 20 && !ok; i++) {
  ok = await page.evaluate(async ([me, a]) => (await import("/src/features/inbox/assistantPick.ts")).setSyncedAssistant(me, a), [pk, AGENT]);
  if (!ok) await page.waitForTimeout(500);
}
console.log("PICK", ok);
await page.evaluate(() => window.dispatchEvent(new Event("buzz-web-assistant-toggle")));
const popup = page.locator('[data-testid="web-assistant-popover"]');
await popup.waitFor({ timeout: 15000 });
await page.click('[data-testid="web-assistant-tab-chat"]').catch(() => {});
const comp = popup.locator('[data-testid="message-composer"]');
const r = {};
r.composer = await comp.count();
r.textarea = await popup.locator("textarea").count();
r.collapsedBefore = await comp.getAttribute("data-phone-collapsed");
r.toolbarBefore = await popup.locator('[data-testid="message-composer-toolbar"]').isVisible().catch(() => false);
const before = await comp.boundingBox();
await popup.locator("[contenteditable='true']").first().tap();
await page.waitForTimeout(400);
r.collapsedAfter = await comp.getAttribute("data-phone-collapsed");
r.toolbarAfter = await popup.locator('[data-testid="message-composer-toolbar"]').isVisible().catch(() => false);
r.focused = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="web-assistant-input"]'));
const after = await comp.boundingBox();
r.heightBefore = Math.round(before?.height ?? 0); r.heightAfter = Math.round(after?.height ?? 0);
const slot = await popup.locator('[data-testid="web-assistant-typing-slot"]').boundingBox();
r.slotBelowComposer = !!slot && !!after && slot.y >= after.y + after.height - 1;
r.slotHeight = Math.round(slot?.height ?? 0);
await page.keyboard.type("hello from s30");
await page.keyboard.press("Enter");
await page.waitForTimeout(9000);
r.transcript = (await popup.innerText()).slice(0, 400);
r.sentShown = await popup.getByText("hello from s30").count();
r.alert = await page.locator("[role=alert], [data-sonner-toast]").allInnerTexts();
r.cleared = (await popup.locator("[contenteditable='true']").first().innerText()).trim() === "";
await page.screenshot({ path: "/tmp/s30.png" });
console.log("RESULT", JSON.stringify(r));
console.log(errs.join("\n"));
await browser.close();
