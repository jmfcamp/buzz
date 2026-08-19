import { expect, test, type Page } from "@playwright/test";

import { installMockBridge } from "../helpers/bridge";
import { openSettings } from "../helpers/settings";

type CommandLogEntry = {
  command: string;
  payload?: Record<string, unknown>;
};

async function readCommandLog(page: Page) {
  return page.evaluate(
    () =>
      (
        window as Window & {
          __BUZZ_E2E_COMMAND_LOG__?: CommandLogEntry[];
        }
      ).__BUZZ_E2E_COMMAND_LOG__ ?? [],
  );
}

test("hides Bots settings from regular members", async ({ page }) => {
  await installMockBridge(page, {
    relayRequiresMembership: true,
    relayRole: "member",
  });
  await page.goto("/");
  await openSettings(page);

  await expect(page.getByTestId("settings-nav-bots")).toHaveCount(0);
  await expect(page.getByTestId("settings-nav-community-members")).toHaveCount(
    0,
  );
});

test("hides Bots settings on open relays", async ({ page }) => {
  await installMockBridge(page);
  await page.goto("/");
  await openSettings(page);

  await expect(page.getByTestId("settings-nav-bots")).toHaveCount(0);
});

test("owner can connect, see pending approval, then install remote agents", async ({
  page,
}) => {
  await installMockBridge(page, {
    relayRequiresMembership: true,
    relayRole: "owner",
  });
  await page.goto("/");
  await openSettings(page, "bots");

  await expect(page.getByTestId("settings-nav-bots")).toContainText("Bots");
  await expect(page.getByTestId("settings-panel-bots")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bots", exact: true }),
  ).toBeVisible();

  await page.getByTestId("settings-bots-url").fill("wss://stitch.example.com");
  await page.getByTestId("settings-bots-password").fill("gateway-password");
  await page.getByTestId("settings-bots-connect").click();

  await expect(page.getByTestId("settings-bots-pending")).toBeVisible();
  await expect(page.getByTestId("settings-bots-request-id")).toHaveText(
    "pairing-req-42",
  );
  await expect(page.getByTestId("settings-bots-device-id")).toHaveText(
    "0736ef3394efb187aea8d47e3df7151a5f92b837a9d3448ad0ee6e6124c53f91",
  );
  await expect(
    page.getByTestId("settings-bots-requested-scopes"),
  ).toContainText("operator.write");
  await expect(
    page.getByTestId("settings-bots-requested-scopes"),
  ).toContainText("operator.admin");

  await page.evaluate(() => window.__BUZZ_E2E_APPROVE_COMMUNITY_BOTS__?.());
  await page.getByTestId("settings-bots-connect").click();

  await expect(page.getByTestId("settings-bots-agent-main")).toBeVisible();
  await expect(page.getByTestId("settings-bots-agent-mo")).toBeVisible();
  await expect(page.getByTestId("settings-bots-install-mo")).toBeVisible();
  await expect(page.getByTestId("settings-bots-agent-name-mo")).toHaveValue(
    "Mo",
  );

  await page.getByTestId("settings-bots-agent-name-mo").fill("Mo Desk");
  await page.getByTestId("settings-bots-install-mo").click();
  await expect(page.getByTestId("settings-bots-installed-mo")).toBeVisible();
  await expect(page.getByTestId("settings-bots-installed-name-mo")).toHaveValue(
    "Mo Desk",
  );
  await expect(
    page
      .getByTestId("settings-bots-installed-mo")
      .getByTestId("settings-bots-uninstall-mo"),
  ).toBeVisible();

  await page.getByTestId("settings-bots-installed-name-mo").fill("Mo Channel");
  await page.getByTestId("settings-bots-rename-mo").click();
  await expect(page.getByTestId("settings-bots-installed-name-mo")).toHaveValue(
    "Mo Channel",
  );
});

test("admin can open Bots and any member can add an installed bot to a channel", async ({
  page,
}) => {
  await installMockBridge(page, {
    relayRequiresMembership: true,
    relayRole: "admin",
    communityBots: { startConnected: true },
  });
  await page.goto("/");
  await openSettings(page, "bots");

  await expect(page.getByTestId("settings-nav-bots")).toBeVisible();
  await page.getByTestId("settings-bots-install-mo").click();
  await expect(page.getByTestId("settings-bots-installed-mo")).toBeVisible();

  await page.getByTestId("settings-back-to-app").click();
  await expect(page.getByTestId("settings-view")).toHaveCount(0);

  await page.getByTestId("channel-random").click();
  await page.getByTestId("channel-members-trigger").click();
  await expect(page.getByTestId("members-sidebar")).toBeVisible();
  await page.getByTestId("channel-management-search-users").fill("mo");
  await expect(
    page.getByTestId(`channel-user-search-result-${"22".repeat(32)}`),
  ).toBeVisible();
  await expect(page.getByText("Mo", { exact: true })).toBeVisible();

  await page
    .getByTestId(`channel-user-search-result-${"22".repeat(32)}`)
    .click();
  await expect
    .poll(async () =>
      (await readCommandLog(page)).filter(
        (entry) => entry.command === "add_channel_members",
      ),
    )
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: "add_channel_members",
          payload: expect.objectContaining({
            pubkeys: ["22".repeat(32)],
            role: "bot",
          }),
        }),
      ]),
    );
});

test("Install uses the VPS pubkey and does not mint an nsec", async ({
  page,
}) => {
  await installMockBridge(page, {
    relayRequiresMembership: true,
    relayRole: "owner",
    communityBots: { startConnected: true },
  });
  await page.goto("/");
  await openSettings(page, "bots");

  await page.getByTestId("settings-bots-install-mo").click();
  await expect(page.getByTestId("settings-bots-installed-mo")).toBeVisible();

  const resolveCalls = (await readCommandLog(page)).filter(
    (entry) => entry.command === "community_bots_resolve_identity",
  );
  expect(resolveCalls).toHaveLength(1);
  expect(resolveCalls[0]?.payload).toEqual(
    expect.objectContaining({
      agentId: "mo",
      pubkey: "22".repeat(32),
    }),
  );
});

test("agents without a VPS Buzz pubkey must not mint", async ({ page }) => {
  await installMockBridge(page, {
    relayRequiresMembership: true,
    relayRole: "owner",
    communityBots: {
      startConnected: true,
      remoteAgents: [{ id: "wayfinder", name: "Wayfinder", pubkey: null }],
    },
  });
  await page.goto("/");
  await openSettings(page, "bots");

  await expect(
    page.getByTestId("settings-bots-agent-missing-wayfinder"),
  ).toContainText("openclaw channels add --channel buzz --account wayfinder");
  await expect(
    page.getByTestId("settings-bots-install-wayfinder"),
  ).toBeDisabled();
  await expect(
    page.getByTestId("settings-bots-agent-pubkey-wayfinder"),
  ).toBeVisible();
});
