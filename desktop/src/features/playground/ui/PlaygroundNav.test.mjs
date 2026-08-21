import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";

import { installLocalStorage } from "../lib/testStorage.mjs";

const card = {
  hula: "playground",
  v: 1,
  name: "Demo",
  url: "https://app.example.com",
  pin: "4455",
  sid: "demo-1",
  stack: "hula-app",
};

const hulaChannel = {
  archivedAt: null,
  channelType: "stream",
  description: "",
  id: "hula-id",
  isMember: true,
  lastMessageAt: null,
  memberCount: 1,
  memberPubkeys: [],
  name: "hula",
  participantPubkeys: [],
  participants: [],
  purpose: null,
  topic: null,
  ttlDeadline: null,
  ttlSeconds: null,
  visibility: "open",
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
  installLocalStorage(dom.window.localStorage);
  dom.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
});

afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
  const { resetPlaygroundState } = await import("../lib/sessions.ts");
  resetPlaygroundState();
});

after(() => dom.window.close());

async function renderNav() {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  const { SidebarMenu, SidebarProvider } = await import(
    "@/shared/ui/sidebar.tsx"
  );
  const { TooltipProvider } = await import("@/shared/ui/tooltip.tsx");
  const { ChannelMenuButton } = await import(
    "@/features/sidebar/ui/SidebarSection.tsx"
  );
  const { PlaygroundMenuItems } = await import("./PlaygroundMenuItems.tsx");
  const { addPlaygroundSession, configurePlaygroundScope } = await import(
    "../lib/sessions.ts"
  );

  configurePlaygroundScope("pub", "wss://relay.example.com");
  addPlaygroundSession(card);

  render(
    createElement(
      TooltipProvider,
      null,
      createElement(
        SidebarProvider,
        null,
        createElement(SidebarMenu, null, [
          createElement(ChannelMenuButton, {
            channel: hulaChannel,
            hasUnread: false,
            isActive: true,
            key: "channel",
            onSelectChannel: () => {},
          }),
          createElement(PlaygroundMenuItems, { key: "playground" }),
        ]),
      ),
    ),
  );
  return screen;
}

test("clicking the current channel row parks the overlay", async () => {
  const screen = await renderNav();
  const { fireEvent } = await import("@testing-library/react");
  const { getActivePlaygroundSid, listPlaygroundSessions } = await import(
    "../lib/sessions.ts"
  );

  assert.equal(getActivePlaygroundSid(), "demo-1");
  await fireEvent.click(screen.getByTestId("channel-hula"));
  assert.equal(getActivePlaygroundSid(), null);
  assert.equal(listPlaygroundSessions().length, 1);
});

test("clicking the playground menu row reopens and does not dismiss", async () => {
  const screen = await renderNav();
  const { fireEvent } = await import("@testing-library/react");
  const {
    dismissPlayground,
    getActivePlaygroundSid,
    listPlaygroundSessions,
  } = await import("../lib/sessions.ts");

  assert.equal(getActivePlaygroundSid(), "demo-1");
  await fireEvent.click(screen.getByTestId("open-playground-demo-1"));
  assert.equal(getActivePlaygroundSid(), "demo-1");

  dismissPlayground();
  assert.equal(getActivePlaygroundSid(), null);

  await fireEvent.click(screen.getByTestId("open-playground-demo-1"));
  assert.equal(getActivePlaygroundSid(), "demo-1");
  assert.equal(listPlaygroundSessions().length, 1);
});
