import { expect, test } from "@playwright/test";

import { installMockBridge, TEST_IDENTITIES } from "../helpers/bridge";

const BESTIE_PUBKEY = TEST_IDENTITIES.alice.pubkey;
const RELAY_URL = "ws://localhost:3000";

async function enableBestie(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "buzz-feature-overrides-v1",
      JSON.stringify({ bestie: true }),
    );
  });
}

async function cachedMessageContent(
  page: import("@playwright/test").Page,
  messageId: string,
) {
  return page.evaluate((id) => {
    const client = window.__BUZZ_E2E_QUERY_CLIENT__ as unknown as
      | {
          getQueryCache: () => {
            getAll: () => Array<{ state: { data: unknown } }>;
          };
        }
      | undefined;
    if (!client?.getQueryCache) return null;
    const seen = new Set<object>();
    const visit = (value: unknown): string | null => {
      if (!value || typeof value !== "object") return null;
      if (seen.has(value)) return null;
      seen.add(value);
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = visit(item);
          if (found) return found;
        }
        return null;
      }
      const record = value as { id?: unknown; content?: unknown };
      if (record.id === id && typeof record.content === "string") {
        return record.content;
      }
      for (const child of Object.values(record)) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    for (const query of client.getQueryCache().getAll()) {
      const found = visit(query.state.data);
      if (found) return found;
    }
    return null;
  }, messageId);
}

test("Ask Assistant from a message can include that message", async ({
  page,
}) => {
  await enableBestie(page);
  await installMockBridge(
    page,
    {
      managedAgents: [
        {
          pubkey: BESTIE_PUBKEY,
          name: "Mochi",
          avatarUrl:
            "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
          status: "stopped",
        },
      ],
      managedAgentRuntimes: [
        {
          pubkey: BESTIE_PUBKEY,
          relayUrl: RELAY_URL,
          lifecycle: "stopped",
        },
      ],
    },
    { seedPreviewFeatures: false },
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.getByTestId("open-agents-view").click();
  await page.getByRole("button", { name: "Mochi agent profile" }).click();
  const bestieAction = page.getByTestId("user-profile-bestie-action");
  await expect(bestieAction).toContainText("Make Assistant");
  await bestieAction.click();
  const confirmation = page.getByTestId("bestie-confirm-dialog");
  await confirmation.getByRole("button", { name: "Make Assistant" }).click();
  await expect(bestieAction).toContainText("Remove Assistant");
  await page.keyboard.press("Escape");

  const footerTrigger = page.getByTestId("bestie-profile-trigger");
  await footerTrigger.click();
  const footerComposer = page.getByLabel("Message Mochi");
  await expect(footerComposer).toBeVisible();
  await expect(page.getByTestId("bestie-include-message-context")).toHaveCount(
    0,
  );
  await footerTrigger.click();
  await expect(footerComposer).toHaveCount(0);

  await page.getByTestId("channel-general").click();
  const messageRow = page.getByTestId("message-row").first();
  await messageRow.hover();
  const messageAction = messageRow.getByRole("button", {
    name: "Ask Assistant about this message",
  });
  await expect(messageAction).toBeVisible();
  await messageAction.click();

  const messagePopover = page
    .locator("[data-radix-popper-content-wrapper]")
    .last();
  const includeContext = messagePopover.getByRole("checkbox", {
    name: "Include message context",
  });
  await expect(includeContext).toBeChecked();
  await expect(
    messagePopover.getByTestId("bestie-message-snapshot"),
  ).toBeVisible();
  await includeContext.click();
  await expect(includeContext).not.toBeChecked();
  await expect(
    messagePopover.getByTestId("bestie-message-snapshot"),
  ).toHaveCount(0);
  await includeContext.click();
  await expect(includeContext).toBeChecked();
  await expect(
    messagePopover.getByTestId("bestie-message-snapshot"),
  ).toBeVisible();

  const composer = messagePopover.getByLabel("Message Mochi");
  await composer.fill("What does this mean?");
  await composer.press("Enter");
  const sentRow = messagePopover
    .getByTestId("message-row")
    .filter({ hasText: "What does this mean?" });
  await expect(sentRow).toBeVisible();
  await expect(
    messagePopover.getByTestId("bestie-mini-transcript"),
  ).not.toContainText("Help me with this thread");
  const sentMessageId = await sentRow.getAttribute("data-message-id");
  expect(sentMessageId).toBeTruthy();
  const sentContent = await cachedMessageContent(page, sentMessageId as string);
  expect(sentContent).toContain("Help me with this thread from");
  expect(sentContent).toContain("buzz://message?");
  expect(sentContent).toContain("What does this mean?");
  await expect(includeContext).toHaveCount(0);

  const transcript = messagePopover.getByTestId("bestie-mini-transcript");
  const bestieChannelName = await transcript.getAttribute(
    "data-bestie-channel-name",
  );
  expect(bestieChannelName).toBeTruthy();
  await page.evaluate(
    ({ channelName, parentEventId, pubkey }) => {
      for (let index = 0; index < 24; index += 1) {
        window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
          channelName,
          content: `History row ${index} stays in the scroll area.`,
          parentEventId,
          pubkey,
        });
      }
    },
    {
      channelName: bestieChannelName as string,
      parentEventId: sentMessageId as string,
      pubkey: BESTIE_PUBKEY,
    },
  );
  await expect(transcript).toContainText("History row 23 stays in the scroll");
  const composerBox = await composer.boundingBox();
  const popoverBox = await messagePopover.boundingBox();
  const viewport = page.viewportSize();
  expect(composerBox).not.toBeNull();
  expect(popoverBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(composerBox?.y).toBeGreaterThanOrEqual(0);
  expect(
    (composerBox?.y ?? 0) + (composerBox?.height ?? 0),
  ).toBeLessThanOrEqual(viewport?.height ?? 0);
  expect(popoverBox?.y).toBeGreaterThanOrEqual(0);
  expect((popoverBox?.y ?? 0) + (popoverBox?.height ?? 0)).toBeLessThanOrEqual(
    (viewport?.height ?? 0) + 1,
  );
  expect(popoverBox?.height).toBeGreaterThan(120);

  await messagePopover.getByRole("button", { name: "Close Assistant" }).click();
  await expect(page.getByLabel("Message Mochi")).toHaveCount(0);

  await messageRow.hover();
  await messageAction.click();
  const freshPopover = page
    .locator("[data-radix-popper-content-wrapper]")
    .last();
  await expect(
    freshPopover.getByTestId("bestie-mini-transcript"),
  ).toContainText("What does this mean?");
  const freshInclude = freshPopover.getByRole("checkbox", {
    name: "Include message context",
  });
  await expect(freshInclude).toBeChecked();
  await freshInclude.click();
  const plainComposer = freshPopover.getByLabel("Message Mochi");
  await plainComposer.fill("Just a note");
  await plainComposer.press("Enter");
  const plainRow = freshPopover
    .getByTestId("message-row")
    .filter({ hasText: "Just a note" });
  await expect(plainRow).toBeVisible();
  const plainMessageId = await plainRow.getAttribute("data-message-id");
  expect(plainMessageId).toBeTruthy();
  const plainContent = await cachedMessageContent(
    page,
    plainMessageId as string,
  );
  expect(plainContent).toContain("Just a note");
  expect(plainContent).not.toContain("buzz://message");
  expect(plainContent).not.toContain("Help me with this thread");
  await expect(freshInclude).toBeVisible();

  await freshPopover.getByRole("button", { name: "Close Assistant" }).click();
  await expect(page.getByLabel("Message Mochi")).toHaveCount(0);

  const otherRow = page.getByTestId("message-row").nth(1);
  await otherRow.hover();
  await otherRow
    .getByRole("button", { name: "Ask Assistant about this message" })
    .click();
  const otherPopover = page
    .locator("[data-radix-popper-content-wrapper]")
    .last();
  await expect(otherPopover.getByLabel("Message Mochi")).toBeVisible();
  await expect(otherPopover.getByText("What does this mean?")).toHaveCount(0);
  await expect(otherPopover.getByText("Just a note")).toHaveCount(0);
  await otherPopover.getByRole("button", { name: "Close Assistant" }).click();

  await footerTrigger.click();
  const footerAgain = page
    .locator("[data-radix-popper-content-wrapper]")
    .last();
  await expect(footerAgain.getByLabel("Message Mochi")).toBeVisible();
  await expect(footerAgain.getByText("What does this mean?")).toHaveCount(0);
  await expect(footerAgain.getByText("Just a note")).toHaveCount(0);
});
