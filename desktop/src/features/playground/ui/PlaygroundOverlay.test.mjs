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
});

after(() => dom.window.close());

async function renderHost() {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  const { PlaygroundHost } = await import("./PlaygroundOverlay.tsx");
  const { addPlaygroundSession, configurePlaygroundScope } = await import(
    "../lib/sessions.ts"
  );
  configurePlaygroundScope("pub", "wss://relay.example.com");
  addPlaygroundSession(card);
  render(createElement(PlaygroundHost));
  return screen;
}

test("overlay shows chrome PIN and parks on Dismiss", async () => {
  const screen = await renderHost();
  assert.ok(screen.getByTestId("playground-overlay"));
  assert.equal(screen.getByTestId("playground-chrome-pin").textContent, "4455");
  assert.ok(screen.getByTestId("playground-desktop-stage"));

  screen.getByTestId("playground-dismiss").click();
  assert.equal(screen.queryByTestId("playground-overlay"), null);

  const {
    getActivePlaygroundSid,
    listPlaygroundSessions,
    showPlaygroundSession,
  } = await import("../lib/sessions.ts");
  assert.equal(listPlaygroundSessions().length, 1);
  assert.equal(getActivePlaygroundSid(), null);

  showPlaygroundSession("demo-1");
});

test("Dispose removes the session; device museum has the locked devices", async () => {
  const screen = await renderHost();
  screen.getByTestId("playground-mode-mobile").click();
  assert.ok(screen.getByTestId("playground-mobile-stage"));
  assert.ok(screen.getByTestId("playground-device-iphone-se"));
  assert.ok(screen.getByTestId("playground-device-iphone-16"));
  assert.ok(screen.getByTestId("playground-device-iphone-16-pro-max"));
  assert.ok(screen.getByTestId("playground-device-pixel-8"));
  assert.ok(screen.getByTestId("playground-device-ipad-mini"));
  assert.ok(screen.getByTestId("playground-device-ipad-pro-11"));

  screen.getByTestId("playground-dispose").click();
  assert.equal(screen.queryByTestId("playground-overlay"), null);
  const { listPlaygroundSessions } = await import("../lib/sessions.ts");
  assert.equal(listPlaygroundSessions().length, 0);
});
