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
});

after(() => dom.window.close());

test("Add probes first: down means toast and no ghost row", async () => {
  const { createElement } = await import("react");
  const { fireEvent, render, screen, waitFor } = await import(
    "@testing-library/react"
  );
  const { PlaygroundCard } = await import("./PlaygroundCard.tsx");
  const { configurePlaygroundScope, listPlaygroundSessions } = await import(
    "../lib/sessions.ts"
  );

  configurePlaygroundScope("pub", "wss://relay.example.com");
  globalThis.__BUZZ_PLAYGROUND_PROBE__ = () => ({
    up: false,
    status: 502,
    message: "bad gateway",
  });

  render(createElement(PlaygroundCard, { card }));
  assert.equal(screen.getByTestId("playground-card-name").textContent, "Demo");
  assert.match(
    screen.getByTestId("playground-card-pin").textContent ?? "",
    /4455/,
  );
  await fireEvent.click(screen.getByTestId("playground-card-add"));
  await waitFor(() => assert.equal(listPlaygroundSessions().length, 0));
});

test("Add on an up probe creates a session that the card can re-add after dispose", async () => {
  const { createElement } = await import("react");
  const { fireEvent, render, screen, waitFor } = await import(
    "@testing-library/react"
  );
  const { PlaygroundCard } = await import("./PlaygroundCard.tsx");
  const {
    configurePlaygroundScope,
    disposePlayground,
    listPlaygroundSessions,
  } = await import("../lib/sessions.ts");

  configurePlaygroundScope("pub", "wss://relay.example.com");
  globalThis.__BUZZ_PLAYGROUND_PROBE__ = () => ({ up: true, status: 200 });

  render(createElement(PlaygroundCard, { card }));
  await fireEvent.click(screen.getByTestId("playground-card-add"));
  await waitFor(() => assert.equal(listPlaygroundSessions().length, 1));

  disposePlayground("demo-1");
  assert.equal(listPlaygroundSessions().length, 0);

  await fireEvent.click(screen.getByTestId("playground-card-add"));
  await waitFor(() => assert.equal(listPlaygroundSessions().length, 1));
});
