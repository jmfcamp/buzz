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
  delete globalThis.__BUZZ_PLAYGROUND_PROBE__;
  delete globalThis.__BUZZ_PLAYGROUND_OPEN_URL__;
  delete dom.window.__TAURI_INTERNALS__;
  delete globalThis.__TAURI_INTERNALS__;
});

after(() => dom.window.close());

async function renderCard() {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  const { PlaygroundCard } = await import("./PlaygroundCard.tsx");
  const { configurePlaygroundScope } = await import("../lib/sessions.ts");
  configurePlaygroundScope("pub", "wss://relay.example.com");
  render(createElement(PlaygroundCard, { card }));
  return screen;
}

test("Open sits to the right of the body, not as a footer-only action", async () => {
  const screen = await renderCard();
  const cardEl = screen.getByTestId("playground-card");
  assert.equal(cardEl.getAttribute("data-orientation"), "horizontal");
  const open = screen.getByTestId("playground-card-open");
  assert.equal(open.textContent, "Open");
  const body = screen
    .getByTestId("playground-card-name")
    .closest("[data-slot='attachment-content']");
  const actions = open.closest("[data-slot='attachment-actions']");
  assert.ok(body);
  assert.ok(actions);
  assert.equal(body.parentElement, cardEl);
  assert.equal(actions.parentElement, cardEl);
  const children = [...cardEl.children];
  assert.ok(children.indexOf(actions) > children.indexOf(body));
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
});

test("Open on a new sid probes and creates a session", async () => {
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const { listPlaygroundSessions } = await import("../lib/sessions.ts");
  const screen = await renderCard();
  let probed = 0;
  globalThis.__BUZZ_PLAYGROUND_PROBE__ = () => {
    probed += 1;
    return { up: true, status: 200 };
  };

  await fireEvent.click(screen.getByTestId("playground-card-open"));
  await waitFor(() => assert.equal(listPlaygroundSessions().length, 1));
  assert.equal(probed, 1);
});

test("Open on an existing sid shows it and does not probe again", async () => {
  const { fireEvent, waitFor } = await import("@testing-library/react");
  const {
    addPlaygroundSession,
    dismissPlayground,
    getActivePlaygroundSid,
    listPlaygroundSessions,
  } = await import("../lib/sessions.ts");
  const screen = await renderCard();

  addPlaygroundSession(card);
  dismissPlayground();
  assert.equal(getActivePlaygroundSid(), null);
  assert.equal(listPlaygroundSessions().length, 1);

  let probed = 0;
  globalThis.__BUZZ_PLAYGROUND_PROBE__ = () => {
    probed += 1;
    return { up: true, status: 200 };
  };

  await fireEvent.click(screen.getByTestId("playground-card-open"));
  await waitFor(() => assert.equal(getActivePlaygroundSid(), "demo-1"));
  assert.equal(listPlaygroundSessions().length, 1);
  assert.equal(probed, 0);
});

test("URL is an anchor that opens the browser and does not add a session", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const { listPlaygroundSessions } = await import("../lib/sessions.ts");
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
  assert.deepEqual(opened, ["https://app.example.com"]);
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
