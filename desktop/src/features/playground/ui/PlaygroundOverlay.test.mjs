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
    Blob: dom.window.Blob,
    File: dom.window.File,
    document: dom.window.document,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
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
  if (typeof dom.window.URL.createObjectURL !== "function") {
    dom.window.URL.createObjectURL = () => "blob:playground-test";
    dom.window.URL.revokeObjectURL = () => undefined;
  }
  globalThis.URL = dom.window.URL;
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

async function renderOverlay() {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  const { PlaygroundOverlay } = await import("./PlaygroundOverlay.tsx");
  const { addPlaygroundSession, configurePlaygroundScope } = await import(
    "../lib/sessions.ts"
  );
  configurePlaygroundScope("pub", "wss://relay.example.com");
  const session = addPlaygroundSession(card);
  render(createElement(PlaygroundOverlay, { session }));
  return screen;
}

test("overlay shows chrome PIN and parks on Dismiss", async () => {
  const screen = await renderOverlay();
  assert.ok(screen.getByTestId("playground-overlay"));
  assert.equal(screen.getByTestId("playground-chrome-pin").textContent, "4455");
  assert.ok(screen.getByTestId("playground-desktop-stage"));

  const { fireEvent } = await import("@testing-library/react");
  await fireEvent.click(screen.getByTestId("playground-dismiss"));
  const {
    getActivePlaygroundSid,
    listPlaygroundSessions,
    showPlaygroundSession,
  } = await import("../lib/sessions.ts");
  assert.equal(listPlaygroundSessions().length, 1);
  assert.equal(getActivePlaygroundSid(), null);

  showPlaygroundSession("demo-1");
  assert.equal(getActivePlaygroundSid(), "demo-1");
});

test("Dispose is confirmed and removes the session; device museum is a dropdown", async () => {
  const screen = await renderOverlay();
  const { fireEvent } = await import("@testing-library/react");
  await fireEvent.click(screen.getByTestId("playground-mode-mobile"));
  assert.ok(screen.getByTestId("playground-mobile-stage"));
  const select = screen.getByTestId("playground-device-select");
  assert.equal(select.tagName, "SELECT");
  assert.ok(screen.getByTestId("playground-device-iphone-se"));
  assert.ok(screen.getByTestId("playground-device-iphone-16"));
  assert.ok(screen.getByTestId("playground-device-iphone-16-pro-max"));
  assert.ok(screen.getByTestId("playground-device-pixel-8"));
  assert.ok(screen.getByTestId("playground-device-ipad-mini"));
  assert.ok(screen.getByTestId("playground-device-ipad-pro-11"));
  assert.equal(
    screen
      .getByTestId("playground-webview-host")
      .getAttribute("data-viewport-width"),
    "393",
  );

  await fireEvent.click(screen.getByTestId("playground-dispose"));
  await fireEvent.click(screen.getByTestId("playground-dispose-confirm"));
  const { listPlaygroundSessions, getActivePlaygroundSid } = await import(
    "../lib/sessions.ts"
  );
  assert.equal(listPlaygroundSessions().length, 0);
  assert.equal(getActivePlaygroundSid(), null);
});

test("URL prefix is locked and suffix submits a same-origin navigation", async () => {
  const screen = await renderOverlay();
  assert.equal(
    screen.getByTestId("playground-url-prefix").textContent,
    "https://app.example.com/",
  );
  assert.equal(screen.getByTestId("playground-url-suffix").value, "");
});

test("Screenshot is hidden without a channel and stages a draft with one", async () => {
  const { createElement } = await import("react");
  const { render, screen, fireEvent, cleanup } = await import(
    "@testing-library/react"
  );
  const { PlaygroundOverlay } = await import("./PlaygroundOverlay.tsx");
  const {
    addPlaygroundSession,
    configurePlaygroundScope,
    getActivePlaygroundSid,
  } = await import("../lib/sessions.ts");
  const { initDraftStore } = await import(
    "@/features/messages/lib/useDrafts.ts"
  );
  const { takeQueuedAttachmentsForDraft } = await import(
    "@/features/messages/lib/backgroundMediaUploadStore.ts"
  );

  configurePlaygroundScope("pub", "wss://relay.example.com");
  initDraftStore("pub", "wss://relay.example.com");
  const session = addPlaygroundSession(card);
  render(createElement(PlaygroundOverlay, { session }));
  assert.equal(screen.queryByTestId("playground-screenshot"), null);
  cleanup();

  render(
    createElement(PlaygroundOverlay, {
      conversation: { channelId: "hula-id", draftKey: "hula-id" },
      session,
    }),
  );
  assert.ok(screen.getByTestId("playground-screenshot"));
  const { act } = await import("@testing-library/react");
  await act(async () => {
    await fireEvent.click(screen.getByTestId("playground-screenshot"));
  });
  assert.equal(getActivePlaygroundSid(), null);
  assert.equal(takeQueuedAttachmentsForDraft("hula-id").length, 1);
});
