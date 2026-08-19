import { expect, test } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";
import { openSettings } from "../helpers/settings";

test.beforeEach(async ({ page }) => {
  await installMockBridge(page);
});

test("Wayfinder appears in the primary menu and opens a site view", async ({
  page,
}) => {
  await page.goto("/");
  const wayfinder = page.getByTestId("open-pinned-site-wayfinder");
  await expect(wayfinder).toBeVisible();
  await wayfinder.click();
  await expect(page).toHaveURL(/#\/pins\/wayfinder$/);
  await expect(page.getByTestId("pinned-site-view")).toBeVisible();
  await expect(page.getByTestId("pinned-site-back")).toBeDisabled();
  await expect(page.getByTestId("pinned-site-forward")).toBeDisabled();
  await expect(page.getByTestId("pinned-site-refresh")).toBeEnabled();
  await expect(page.getByTestId("open-agents-view")).toBeVisible();
});

test("Settings → Pinned sites shows the card, heading, and Add button", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page, "pinned-sites");

  await expect(page.getByTestId("settings-view")).toBeVisible();
  await expect(page.getByTestId("settings-sidebar")).toBeVisible();
  await expect(page.getByTestId("settings-panel-pinned-sites")).toBeVisible();
  await expect(page.getByTestId("settings-pinned-sites")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pinned sites" }),
  ).toBeVisible();
  await expect(page.getByTestId("pinned-sites-add")).toBeVisible();
  await expect(page.getByTestId("pinned-sites-add")).toHaveText("Add");
  await expect(page.getByTestId("app-loading-gate")).toHaveCount(0);
  await expect(page.getByTestId("boot-splash-overlay")).toHaveCount(0);
});

test("settings can add a personal pin to the primary menu", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page, "pinned-sites");
  await expect(page.getByTestId("settings-pinned-sites")).toBeVisible();
  await expect(page.getByTestId("pinned-site-row-wayfinder")).toBeVisible();

  await page.getByTestId("pinned-sites-add").click();
  await page.getByTestId("pinned-site-name").fill("Docs");
  await page.getByTestId("pinned-site-url").fill("https://example.com/docs");
  await page.getByTestId("pinned-site-icon-book-open").click();
  await page.getByTestId("pinned-site-save").click();
  await expect(page.getByText("Docs", { exact: true }).first()).toBeVisible();

  await page.getByTestId("settings-back-to-app").click();
  await expect(page.getByRole("button", { name: "Docs" })).toBeVisible();
});

test("deleting Wayfinder does not recreate it after reload", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page, "pinned-sites");
  const wayfinderRow = page.getByTestId("pinned-site-row-wayfinder");
  await expect(wayfinderRow).toBeVisible();
  await wayfinderRow
    .getByRole("button", { name: "Actions for Wayfinder" })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(wayfinderRow).toHaveCount(0);

  await page.getByTestId("settings-back-to-app").click();
  await expect(page.getByTestId("open-agents-view")).toBeVisible();
  await expect(page.getByTestId("open-pinned-site-wayfinder")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("open-agents-view")).toBeVisible();
  await expect(page.getByTestId("open-pinned-site-wayfinder")).toHaveCount(0);
});
