import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";

import {
  COMMUNITY_BOT_DIRECTORY_FORBIDDEN_ACTIONS,
  communityBotDirectoryCard,
  communityBotDirectoryDetail,
} from "../lib/directory.ts";

const MO_PUBKEY = "22".repeat(32);

const mo = {
  id: "mo",
  name: "Mo Desk",
  pubkey: MO_PUBKEY,
  source: "openclaw",
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

before(() => {
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    MutationObserver: dom.window.MutationObserver,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    window: dom.window,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
    writable: true,
  });
  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async () => {} },
  });
  dom.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
});

afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});

after(() => dom.window.close());

function assertNoRuntimeControls(container) {
  const text = container.textContent ?? "";
  for (const action of COMMUNITY_BOT_DIRECTORY_FORBIDDEN_ACTIONS) {
    assert.equal(
      text.includes(action),
      false,
      `directory must not offer ${action}`,
    );
  }
}

test("directory cards show catalog names, status, and no agent runtime controls", async () => {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  const { BotsDirectoryGrid } = await import("./BotsDirectoryPanels.tsx");

  const card = communityBotDirectoryCard(
    mo,
    {
      displayName: MO_PUBKEY,
    },
    { presence: "online" },
  );
  const { container } = render(
    createElement(BotsDirectoryGrid, {
      cards: [card],
      onOpenBot: () => {},
    }),
  );

  const cardNode = screen.getByTestId("bot-card-mo");
  assert.equal(cardNode.textContent?.includes("Mo Desk"), true);
  assert.equal(cardNode.textContent?.includes("Online"), true);
  assert.equal(cardNode.textContent?.includes(MO_PUBKEY), false);
  assertNoRuntimeControls(container);
});

test("empty directory points people at Settings → Communities → Bots", async () => {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  const { BotsEmptyState } = await import("./BotsDirectoryPanels.tsx");

  render(createElement(BotsEmptyState, { onOpenSettings: () => {} }));

  const empty = screen.getByTestId("bots-empty-state");
  assert.equal(empty.textContent?.includes("No community bots yet"), true);
  assert.equal(
    empty.textContent?.includes("Settings → Communities → Bots"),
    true,
  );
});

test("pop-out shows about, identity, Message, and an empty channel list without a Status section", async () => {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  const { BotDetailContent } = await import("./BotsDirectoryPanels.tsx");

  const detail = communityBotDirectoryDetail({
    bot: mo,
    channels: [],
    presence: "offline",
    profile: {
      about: "Helps with the desk",
      displayName: "Mo Desk",
    },
  });

  let messageClicks = 0;
  const { container } = render(
    createElement(BotDetailContent, {
      detail,
      onMessage: () => {
        messageClicks += 1;
      },
      onOpenChannel: () => {},
    }),
  );

  assert.equal(screen.getByTestId("bot-detail-name").textContent, "Mo Desk");
  assert.equal(
    screen
      .getByTestId("bot-detail-description")
      .textContent?.includes("Helps with the desk"),
    true,
  );
  assert.equal(screen.getByTestId("bot-detail-status").textContent, "Offline");
  assert.equal(screen.queryByTestId("bot-detail-status-row"), null);
  assert.equal(screen.queryByTestId("bot-detail-back"), null);
  assert.ok(screen.getByTestId("bot-detail-public-key"));
  assert.ok(screen.getByTestId("bot-detail-channels-empty"));
  assert.ok(screen.getByTestId("bot-detail-avatar"));
  const message = screen.getByTestId("bot-detail-message");
  assert.equal(message.textContent?.includes("Message"), true);
  message.click();
  assert.equal(messageClicks, 1);
  assertNoRuntimeControls(container);
});

test("pop-out channel rows match Agents links and keep no start/stop/edit controls", async () => {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  const { BotDetailContent } = await import("./BotsDirectoryPanels.tsx");

  const opened = [];
  const detail = communityBotDirectoryDetail({
    bot: mo,
    channels: [
      {
        archivedAt: null,
        channelType: "stream",
        id: "general",
        memberPubkeys: [MO_PUBKEY],
        name: "general",
      },
    ],
    profile: { about: null },
  });

  const { container } = render(
    createElement(BotDetailContent, {
      detail,
      onMessage: () => {},
      onOpenChannel: (channelId) => opened.push(channelId),
    }),
  );

  assert.equal(screen.queryByTestId("bot-detail-description"), null);
  const channel = screen.getByTestId("bot-detail-channel-general");
  assert.equal(channel.getAttribute("aria-label"), "Open #general");
  assert.equal(
    screen
      .getByTestId("bot-detail-channels-list")
      .textContent?.includes("#general"),
    true,
  );
  channel.click();
  assert.deepEqual(opened, ["general"]);
  assert.ok(screen.getByTestId("bot-detail-message"));
  assertNoRuntimeControls(container);
});

test("hero content uses extra top padding so the avatar clears the panel edge", async () => {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  const { BotDetailContent } = await import("./BotsDirectoryPanels.tsx");

  const detail = communityBotDirectoryDetail({
    bot: mo,
    channels: [],
    profile: { about: null },
  });

  render(
    createElement(BotDetailContent, {
      detail,
      onMessage: () => {},
      onOpenChannel: () => {},
    }),
  );

  const content = screen.getByTestId("bot-detail-content");
  assert.match(content.className, /\bpt-8\b/);
  const avatar = screen.getByTestId("bot-detail-avatar");
  assert.match(avatar.className, /\bh-20\b/);
  assert.match(avatar.className, /\bw-20\b/);
});
