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
  sid: "demo-chrome-layout",
};

/** @type {import("@tanstack/react-query").QueryClient[]} */
const queryClients = [];

async function renderChrome(session, props = {}) {
  const { createElement } = await import("react");
  const { render, screen, fireEvent } = await import("@testing-library/react");
  const { QueryClient, QueryClientProvider } = await import(
    "@tanstack/react-query"
  );
  const { managedAgentsQueryKey } = await import(
    "@/features/agents/hooks.ts"
  );
  const { PlaygroundChrome } = await import("./PlaygroundChrome.tsx");
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Infinity },
    },
  });
  client.setQueryData(managedAgentsQueryKey, []);
  queryClients.push(client);
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(PlaygroundChrome, {
        conversation: null,
        docked: false,
        fullscreen: false,
        mode: "desktop",
        onModeChange() {},
        onToggleDock() {},
        onToggleFullscreen() {},
        session,
        ...props,
      }),
    ),
  );
  return { screen, fireEvent };
}

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
  while (queryClients.length > 0) {
    const client = queryClients.pop();
    await client?.cancelQueries();
    client?.clear();
  }
  const { resetPlaygroundState } = await import("../lib/sessions.ts");
  resetPlaygroundState();
});

after(() => dom.window.close());

test("Open as Split chrome: URL row then modes left + tools right", async () => {
  const { addPlaygroundSession, configurePlaygroundScope } = await import(
    "../lib/sessions.ts"
  );

  configurePlaygroundScope("pub", "wss://relay.example.com");
  const session = addPlaygroundSession(card);
  const { screen } = await renderChrome(session);

  const chrome = screen.getByTestId("playground-chrome");
  const address = screen.getByTestId("playground-address");
  const modeRow = screen.getByTestId("playground-mode-row");
  const tools = screen.getByTestId("playground-tool-icons");

  assert.equal(address.parentElement, chrome);
  assert.equal(modeRow.parentElement, chrome);
  assert.ok(address.compareDocumentPosition(modeRow) & 4);
  assert.ok(modeRow.contains(screen.getByTestId("playground-mode-desktop")));
  assert.ok(modeRow.contains(tools));
  assert.match(tools.className, /ml-auto/);
  assert.ok(tools.contains(screen.getByTestId("browser-agent-toggle")));
  assert.equal(screen.queryByTestId("playground-dispose"), null);
  assert.equal(screen.queryByTestId("browser-agent-chrome"), null);
  assert.equal(screen.queryByTestId("browser-agent-mode-off"), null);
  assert.ok(tools.contains(screen.getByTestId("playground-back")));
  assert.ok(screen.getByTestId("playground-url-prefix"));
});

test("Agent toggle expands Observe/Drive row under chrome; collapse hides it", async () => {
  const { addPlaygroundSession, configurePlaygroundScope } = await import(
    "../lib/sessions.ts"
  );

  configurePlaygroundScope("pub", "wss://relay.example.com");
  const session = addPlaygroundSession(card);
  const { screen, fireEvent } = await renderChrome(session);

  const chrome = screen.getByTestId("playground-chrome");
  const modeRow = screen.getByTestId("playground-mode-row");
  const toggle = screen.getByTestId("browser-agent-toggle");

  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(screen.queryByTestId("browser-agent-chrome"), null);

  await fireEvent.click(toggle);

  const panel = screen.getByTestId("browser-agent-chrome");
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(panel.parentElement, chrome);
  assert.ok(modeRow.compareDocumentPosition(panel) & 4);
  assert.ok(screen.getByTestId("browser-agent-mode-off"));
  assert.ok(screen.getByTestId("browser-agent-mode-observe"));
  assert.ok(screen.getByTestId("browser-agent-mode-drive"));
  assert.equal(modeRow.contains(panel), false);

  await fireEvent.click(toggle);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(screen.queryByTestId("browser-agent-chrome"), null);
  assert.equal(screen.queryByTestId("browser-agent-mode-off"), null);
});

test("Drive chrome lock disables back/forward/refresh and URL suffix", async () => {
  const { addPlaygroundSession, configurePlaygroundScope } = await import(
    "../lib/sessions.ts"
  );
  const { AGENT_DRIVING_CHROME_TOOLTIP } = await import(
    "@/features/browser-agent/lib/chromeLock.ts"
  );

  configurePlaygroundScope("pub", "wss://relay.example.com");
  const session = addPlaygroundSession(card);
  const { screen } = await renderChrome(session, { agentDrivingNavLock: true });

  const back = screen.getByTestId("playground-back");
  const forward = screen.getByTestId("playground-forward");
  const refresh = screen.getByTestId("playground-refresh");
  const suffix = screen.getByTestId("playground-url-suffix");
  const address = screen.getByTestId("playground-address");

  assert.equal(back.disabled, true);
  assert.equal(forward.disabled, true);
  assert.equal(refresh.disabled, true);
  assert.equal(suffix.disabled, true);
  assert.equal(suffix.readOnly, true);
  assert.equal(address.getAttribute("data-agent-driving"), "true");
  assert.equal(suffix.getAttribute("title"), AGENT_DRIVING_CHROME_TOOLTIP);

  const desktop = screen.getByTestId("playground-mode-desktop");
  const responsive = screen.getByTestId("playground-mode-responsive");
  const mobile = screen.getByTestId("playground-mode-mobile");
  assert.equal(desktop.disabled, true);
  assert.equal(responsive.disabled, true);
  assert.equal(mobile.disabled, true);
  assert.equal(desktop.getAttribute("title"), AGENT_DRIVING_CHROME_TOOLTIP);

  // Window chrome stays usable.
  assert.ok(screen.getByTestId("browser-agent-toggle"));
});

test("Observe/unlocked chrome keeps nav enabled per history (override false)", async () => {
  const { addPlaygroundSession, configurePlaygroundScope } = await import(
    "../lib/sessions.ts"
  );

  configurePlaygroundScope("pub", "wss://relay.example.com");
  const session = addPlaygroundSession(card);
  const { screen } = await renderChrome(session, {
    agentDrivingNavLock: false,
  });

  const refresh = screen.getByTestId("playground-refresh");
  const suffix = screen.getByTestId("playground-url-suffix");
  assert.equal(refresh.disabled, false);
  assert.equal(suffix.disabled, false);
  assert.equal(screen.getByTestId("playground-address").getAttribute("data-agent-driving"), null);
  assert.equal(screen.getByTestId("playground-mode-desktop").disabled, false);
  assert.equal(screen.getByTestId("playground-mode-responsive").disabled, false);
  assert.equal(screen.getByTestId("playground-mode-mobile").disabled, false);
});

test("urlBarReadOnly locks the address suffix on secondary tabs", async () => {
  const session = {
    sid: card.sid,
    name: card.name,
    url: card.url,
    hasUpdate: false,
  };
  const { screen } = await renderChrome(session, {
    agentDrivingNavLock: false,
    urlBarReadOnly: true,
  });
  const address = screen.getByTestId("playground-address");
  assert.equal(address.getAttribute("data-url-locked"), "true");
  const suffix = screen.queryByTestId("playground-url-suffix");
  if (suffix) {
    assert.equal(suffix.disabled, true);
    assert.equal(suffix.readOnly, true);
  }
});

test("collapse hides URL and mode rows; expand restores them", async () => {
  const { screen, fireEvent } = await renderChrome({
    sid: card.sid,
    name: card.name,
    url: card.url,
    pin: card.pin,
    hasUpdate: false,
  });

  assert.ok(screen.getByTestId("playground-chrome-tabs-row"));
  const collapse = screen.getByTestId("playground-chrome-collapse");
  assert.equal(
    collapse.getAttribute("aria-label"),
    "Collapse browser chrome",
  );
  assert.ok(screen.getByTestId("playground-address"));
  assert.ok(screen.getByTestId("playground-mode-row"));

  fireEvent.click(collapse);
  assert.equal(
    screen.getByTestId("playground-chrome").getAttribute("data-chrome-collapsed"),
    "true",
  );
  assert.equal(screen.queryByTestId("playground-address"), null);
  assert.equal(screen.queryByTestId("playground-mode-row"), null);
  assert.equal(
    screen.getByTestId("playground-chrome-collapse").getAttribute("aria-label"),
    "Expand browser chrome",
  );

  fireEvent.click(screen.getByTestId("playground-chrome-collapse"));
  assert.equal(
    screen.getByTestId("playground-chrome").getAttribute("data-chrome-collapsed"),
    null,
  );
  assert.ok(screen.getByTestId("playground-address"));
  assert.ok(screen.getByTestId("playground-mode-row"));
});
