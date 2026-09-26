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
    self: dom.window,
    window: dom.window,
  });
  installLocalStorage(dom.window.localStorage);
  dom.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  // Radix Dialog / ThemeProvider call getComputedStyle during open.
  const computed = () => ({
    getPropertyValue: () => "",
    getPropertyPriority: () => "",
    item: () => "",
    length: 0,
    cssText: "",
  });
  dom.window.getComputedStyle = computed;
  globalThis.getComputedStyle = computed;
});

afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
  const { resetPlaygroundState } = await import("../lib/sessions.ts");
  resetPlaygroundState();
  const { resetLinkSidePanelStore } = await import(
    "@/features/link-panel/lib/linkSidePanelStore.ts"
  );
  resetLinkSidePanelStore();
  const { resetConversationPlaygroundPins } = await import(
    "../lib/conversationPins.ts"
  );
  resetConversationPlaygroundPins();
  globalThis.localStorage?.clear();
  delete globalThis.__BUZZ_PLAYGROUND_PROBE__;
  delete globalThis.__BUZZ_PLAYGROUND_OPEN_URL__;
  delete dom.window.__TAURI_INTERNALS__;
  delete globalThis.__TAURI_INTERNALS__;
});

after(() => dom.window.close());

async function renderCard(
  cardData = card,
  { popoutPayload = null, path = "/channels/chan-1" } = {},
) {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  const { QueryClient, QueryClientProvider } = await import(
    "@tanstack/react-query"
  );
  const { PlaygroundCard } = await import("./PlaygroundCard.tsx");
  const { PopoutLayoutProvider } = await import(
    "@/features/popout/lib/popoutLayout.tsx"
  );
  const { TooltipProvider } = await import("@/shared/ui/tooltip");
  const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");
  const {
    Outlet,
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
  } = await import("@tanstack/react-router");
  const { configurePlaygroundScope } = await import("../lib/sessions.ts");
  configurePlaygroundScope("pub", "wss://relay.example.com");
  const rootRoute = createRootRoute({
    component: Outlet,
  });
  const channelRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/channels/$channelId",
    validateSearch: (search) => ({
      thread: typeof search.thread === "string" ? search.thread : undefined,
      threadRootId:
        typeof search.threadRootId === "string"
          ? search.threadRootId
          : undefined,
    }),
    component: () =>
      createElement(
        PopoutLayoutProvider,
        { payload: popoutPayload },
        createElement(PlaygroundCard, { card: cardData }),
      ),
  });
  const router = createRouter({
    defaultPendingMs: 0,
    routeTree: rootRoute.addChildren([channelRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ThemeProvider,
        null,
        createElement(
          TooltipProvider,
          null,
          createElement(RouterProvider, { router }),
        ),
      ),
    ),
  );
  return screen;
}

test("Bot left of Pin top-right; Open under cluster; title/URL wrap left", async () => {
  const screen = await renderCard();
  const cardEl = screen.getByTestId("playground-card");
  assert.equal(cardEl.getAttribute("data-orientation"), "horizontal");
  assert.match(cardEl.className, /items-start/);
  const name = screen.getByTestId("playground-card-name");
  const url = screen.getByTestId("playground-card-url");
  const pin = screen.getByTestId("playground-card-pin-action");
  const open = screen.getByTestId("playground-card-open");
  const agent = screen.getByTestId("playground-card-agent-attach");
  const cluster = screen.getByTestId("playground-card-top-actions");
  assert.equal(open.textContent, "Open");
  assert.equal(pin.getAttribute("aria-label"), "Pin to conversation");
  assert.ok(cluster.contains(agent));
  assert.ok(cluster.contains(pin));
  assert.ok(cluster.contains(open));
  // Bot is left of Pin in the cluster.
  assert.ok(agent.compareDocumentPosition(pin) & 4);
  // Open is under the Bot/Pin cluster.
  assert.ok(agent.compareDocumentPosition(open) & 4);
  assert.match(cluster.className, /absolute/);
  assert.equal(screen.queryByTestId("playground-card-open-split"), null);
  assert.equal(screen.queryByTestId("playground-card-watch"), null);
  assert.equal(screen.queryByTestId("playground-card-let-drive"), null);
  const body = name.closest("[data-slot='attachment-content']");
  assert.ok(body);
  assert.ok(body.contains(url));
  assert.match(name.className, /break-words|whitespace-normal/);
  assert.match(url.className, /break-all|whitespace-normal/);
  assert.match(url.className, /break-all|whitespace-normal|break-words/);
});

test("Open probes first: down means toast and no ghost row", async () => {
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const { listPlaygroundSessions } = await import("../lib/sessions.ts");
  const screen = await renderCard();

  assert.equal(screen.getByTestId("playground-card-name").textContent, "Demo");
  assert.match(
    screen.getByTestId("playground-card-pin").textContent ?? "",
    /4455/,
  );

  globalThis.__BUZZ_PLAYGROUND_PROBE__ = () => ({
    up: false,
    status: 502,
    message: "bad gateway",
  });

  await fireEvent.click(screen.getByTestId("playground-card-open"));
  await waitFor(() => assert.equal(listPlaygroundSessions().length, 0));
  await waitFor(() =>
    assert.equal(screen.getByTestId("playground-card-open").disabled, false),
  );
});

test("Pin icon on a new sid probes and adds a conversation-scoped header pin", async () => {
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const { listConversationPlaygroundPins } = await import(
    "../lib/conversationPins.ts"
  );
  const { getActivePlaygroundSid, listPlaygroundSessions } = await import(
    "../lib/sessions.ts"
  );
  const screen = await renderCard();
  let probed = 0;
  globalThis.__BUZZ_PLAYGROUND_PROBE__ = () => {
    probed += 1;
    return { up: true, status: 200 };
  };

  await fireEvent.click(screen.getByTestId("playground-card-pin-action"));
  await waitFor(() =>
    assert.equal(listConversationPlaygroundPins("channel:chan-1").length, 1),
  );
  assert.equal(
    listConversationPlaygroundPins("channel:chan-1")[0]?.name,
    "Demo",
  );
  // Pin must not open the overlay / left-rail session list.
  assert.equal(listPlaygroundSessions().length, 0);
  assert.equal(getActivePlaygroundSid(), null);
  assert.equal(probed, 1);
});

test("Pin on an existing conversation pin reopens the header menu without probing", async () => {
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const {
    getConversationPlaygroundPinsMenuOpenRequest,
    listConversationPlaygroundPins,
    pinPlaygroundToConversation,
  } = await import("../lib/conversationPins.ts");
  const screen = await renderCard();

  pinPlaygroundToConversation("channel:chan-1", card);
  assert.equal(listConversationPlaygroundPins("channel:chan-1").length, 1);

  let probed = 0;
  globalThis.__BUZZ_PLAYGROUND_PROBE__ = () => {
    probed += 1;
    return { up: true, status: 200 };
  };

  const before = getConversationPlaygroundPinsMenuOpenRequest();
  await fireEvent.click(screen.getByTestId("playground-card-pin-action"));
  await waitFor(() => {
    const req = getConversationPlaygroundPinsMenuOpenRequest();
    assert.ok(req);
    assert.equal(req.scopeKey, "channel:chan-1");
    assert.notEqual(req.nonce, before?.nonce ?? -1);
  });
  assert.equal(listConversationPlaygroundPins("channel:chan-1").length, 1);
  assert.equal(probed, 0);
});

test("URL opens the Projects link slide-out and does not add a session", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const { listPlaygroundSessions } = await import("../lib/sessions.ts");
  const { getLinkSidePanel } = await import(
    "@/features/link-panel/lib/linkSidePanelStore.ts"
  );
  const screen = await renderCard();
  let probed = 0;
  globalThis.__BUZZ_PLAYGROUND_PROBE__ = () => {
    probed += 1;
    return { up: true, status: 200 };
  };
  const opened = [];
  globalThis.__BUZZ_PLAYGROUND_OPEN_URL__ = (url) => {
    opened.push(url);
  };

  const url = screen.getByTestId("playground-card-url");
  assert.equal(url.tagName, "A");
  assert.equal(url.getAttribute("href"), "https://app.example.com");
  await fireEvent.click(url);
  assert.equal(probed, 0);
  assert.equal(listPlaygroundSessions().length, 0);
  assert.deepEqual(opened, []);
  assert.equal(getLinkSidePanel()?.url, "https://app.example.com");
});

test("Open probes then hosts playground RHS side-panel with Agent chrome", async () => {
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const {
    getActivePlaygroundSid,
    getPlaygroundOverlayHost,
    listPlaygroundSessions,
  } = await import("../lib/sessions.ts");
  const { getLinkSidePanel } = await import(
    "@/features/link-panel/lib/linkSidePanelStore.ts"
  );
  const screen = await renderCard();
  let probed = 0;
  globalThis.__BUZZ_PLAYGROUND_PROBE__ = () => {
    probed += 1;
    return { up: true, status: 200 };
  };

  await fireEvent.click(screen.getByTestId("playground-card-open"));
  await waitFor(() => assert.equal(listPlaygroundSessions().length, 1));
  assert.equal(getActivePlaygroundSid(), "demo-1");
  assert.equal(getPlaygroundOverlayHost(), "side-panel");
  assert.equal(getLinkSidePanel(), null);
  assert.equal(probed, 1);
});

test("PIN copy button writes the pin, not the URL", async () => {
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const screen = await renderCard();
  let copied = null;
  const internals = {
    invoke: async (cmd, args) => {
      if (cmd === "copy_text_to_clipboard") {
        copied = args.text;
        return;
      }
      throw new Error(`unmocked Tauri command: ${cmd}`);
    },
    transformCallback: () => Math.random(),
  };
  dom.window.__TAURI_INTERNALS__ = internals;
  globalThis.__TAURI_INTERNALS__ = internals;

  await fireEvent.click(screen.getByTestId("playground-card-copy-pin"));
  await waitFor(() => assert.equal(copied, "4455"));
});

test("PIN is hidden when omitted and Open still works", async () => {
  const { pin: _pin, ...withoutPin } = card;
  const screen = await renderCard(withoutPin);
  assert.equal(screen.queryByTestId("playground-card-pin"), null);
  assert.equal(screen.queryByTestId("playground-card-copy-pin"), null);
  assert.equal(screen.getByTestId("playground-card-open").textContent, "Open");
  assert.ok(screen.getByTestId("playground-card-agent-attach"));
});

test("split pop-out disables Open, Pin, agent attach, and URL clicks", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const { listConversationPlaygroundPins } = await import(
    "../lib/conversationPins.ts"
  );
  const { getLinkSidePanel } = await import(
    "@/features/link-panel/lib/linkSidePanelStore.ts"
  );
  const screen = await renderCard(card, {
    path: "/channels/chan-1?thread=thread-1",
    popoutPayload: {
      kind: "split",
      channelId: "chan-1",
      threadId: "thread-1",
      playground: card,
    },
  });

  const cardEl = screen.getByTestId("playground-card");
  assert.equal(cardEl.getAttribute("data-playground-card-actions"), "disabled");
  const pin = screen.getByTestId("playground-card-pin-action");
  const open = screen.getByTestId("playground-card-open");
  const split = screen.getByTestId("playground-card-open-split");
  const agent = screen.getByTestId("playground-card-agent-attach");
  const url = screen.getByTestId("playground-card-url");
  assert.equal(pin.disabled, true);
  assert.equal(open.disabled, true);
  assert.equal(split.disabled, true);
  assert.equal(agent.disabled, true);
  assert.equal(url.getAttribute("aria-disabled"), "true");
  assert.match(url.className, /opacity-50/);
  assert.match(url.className, /pointer-events-none/);

  let probed = 0;
  globalThis.__BUZZ_PLAYGROUND_PROBE__ = () => {
    probed += 1;
    return { up: true, status: 200 };
  };

  await fireEvent.click(pin);
  await fireEvent.click(open);
  await fireEvent.click(split);
  await fireEvent.click(agent);
  await fireEvent.click(url);
  assert.equal(probed, 0);
  assert.equal(listConversationPlaygroundPins("channel:chan-1").length, 0);
  assert.equal(getLinkSidePanel(), null);
  assert.equal(screen.queryByTestId("browser-agent-grant-dialog"), null);
});

test("thread-only pop-out keeps Open / Pin / agent; disables Open as Split", async () => {
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const { getLinkSidePanel } = await import(
    "@/features/link-panel/lib/linkSidePanelStore.ts"
  );
  const { listConversationPlaygroundPins } = await import(
    "../lib/conversationPins.ts"
  );
  const screen = await renderCard(card, {
    path: "/channels/chan-1?thread=thread-1",
    popoutPayload: {
      kind: "thread",
      channelId: "chan-1",
      threadId: "thread-1",
    },
  });

  const cardEl = screen.getByTestId("playground-card");
  assert.equal(cardEl.getAttribute("data-playground-card-actions"), "enabled");
  const pin = screen.getByTestId("playground-card-pin-action");
  const open = screen.getByTestId("playground-card-open");
  const split = screen.getByTestId("playground-card-open-split");
  const agent = screen.getByTestId("playground-card-agent-attach");
  assert.equal(open.disabled, false);
  assert.equal(pin.disabled, false);
  assert.equal(agent.disabled, false);
  // Thread is open so Split would normally be available — layout greys it.
  assert.equal(split.disabled, true);

  let probed = 0;
  globalThis.__BUZZ_PLAYGROUND_PROBE__ = () => {
    probed += 1;
    return { up: true, status: 200 };
  };

  const {
    getActivePlaygroundSid,
    getPlaygroundOverlayHost,
  } = await import("../lib/sessions.ts");
  await fireEvent.click(open);
  await waitFor(() => assert.equal(getActivePlaygroundSid(), "demo-1"));
  assert.equal(getPlaygroundOverlayHost(), "side-panel");
  assert.equal(getLinkSidePanel(), null);
  assert.equal(probed, 1);

  await fireEvent.click(pin);
  await waitFor(() =>
    assert.equal(listConversationPlaygroundPins("thread:thread-1").length, 1),
  );
  assert.equal(probed, 2);

  // Disabled Split must not probe / open another window.
  const probedBeforeSplit = probed;
  await fireEvent.click(split);
  assert.equal(probed, probedBeforeSplit);
});

test("main window with open thread shows Open as Split enabled + agent", async () => {
  const screen = await renderCard(card, {
    path: "/channels/chan-1?thread=thread-1",
  });
  assert.equal(
    screen
      .getByTestId("playground-card")
      .getAttribute("data-playground-card-actions"),
    "enabled",
  );
  assert.equal(screen.getByTestId("playground-card-open").disabled, false);
  assert.equal(
    screen.getByTestId("playground-card-pin-action").disabled,
    false,
  );
  assert.equal(
    screen.getByTestId("playground-card-open-split").disabled,
    false,
  );
  assert.equal(
    screen.getByTestId("playground-card-agent-attach").disabled,
    false,
  );
});

test("agent attach icon is always present on channel cards (Observe & Drive)", async () => {
  const screen = await renderCard();
  const agent = screen.getByTestId("playground-card-agent-attach");
  assert.equal(agent.getAttribute("aria-label"), "Observe & Drive");
  assert.equal(agent.disabled, false);
  // Full grant Dialog needs browser Theme/Radix plumbing; chrome/Browsers cover that.
  // Card wiring: Bot icon always shown next to Open (not only in threads).
  assert.ok(screen.getByTestId("playground-card-open"));
  assert.equal(screen.queryByTestId("playground-card-watch"), null);
  assert.equal(screen.queryByTestId("playground-card-let-drive"), null);
});
