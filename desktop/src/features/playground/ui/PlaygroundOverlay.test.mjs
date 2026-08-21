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
  assert.match(
    screen.getByTestId("playground-chrome-pin").textContent ?? "",
    /4455/,
  );
  assert.equal(screen.queryByTestId("playground-chrome-name"), null);
  assert.equal(screen.queryByTestId("playground-chrome-stack"), null);
  assert.ok(screen.getByTestId("playground-desktop-stage"));
  const chrome = screen.getByTestId("playground-chrome");
  const dispose = screen.getByTestId("playground-dispose");
  const back = screen.getByTestId("playground-back");
  assert.ok(chrome.contains(dispose));
  assert.ok(dispose.compareDocumentPosition(back) & 4);
  const dismiss = screen.getByTestId("playground-dismiss");
  assert.equal(dismiss.getAttribute("aria-label"), "Dismiss");
  assert.ok(dismiss.querySelector("svg"));
  assert.equal(screen.getByTestId("playground-inspect").textContent, "");
  assert.equal(
    screen.getByTestId("playground-inspect").getAttribute("aria-label"),
    "Inspect",
  );
  assert.ok(
    screen.getByTestId("playground-mode-row").contains(
      screen.getByTestId("playground-chrome-pin"),
    ),
  );

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
  const host = screen.getByTestId("playground-webview-host");
  assert.equal(host.getAttribute("data-viewport-width"), "393");
  assert.match(host.getAttribute("data-user-agent") ?? "", /iPhone|Mobile/);

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
  assert.equal(screen.getByTestId("playground-screenshot").textContent, "");
  assert.equal(
    screen.getByTestId("playground-screenshot").getAttribute("aria-label"),
    "Screenshot",
  );
  const { act } = await import("@testing-library/react");
  await act(async () => {
    await fireEvent.click(screen.getByTestId("playground-screenshot"));
  });
  assert.equal(getActivePlaygroundSid(), null);
  assert.equal(takeQueuedAttachmentsForDraft("hula-id").length, 1);
});

test("PIN is hidden when empty and fullscreen fills the window", async () => {
  const { createElement } = await import("react");
  const { render, screen, fireEvent } = await import("@testing-library/react");
  const { PlaygroundOverlay } = await import("./PlaygroundOverlay.tsx");
  const { addPlaygroundSession, configurePlaygroundScope } = await import(
    "../lib/sessions.ts"
  );
  const { PLAYGROUND_DESKTOP_UA } = await import("../lib/devices.ts");

  configurePlaygroundScope("pub", "wss://relay.example.com");
  const session = addPlaygroundSession({
    hula: "playground",
    v: 1,
    name: "Demo",
    url: "https://app.example.com",
    sid: "demo-open",
  });
  render(createElement(PlaygroundOverlay, { session }));
  assert.equal(screen.queryByTestId("playground-chrome-pin"), null);
  assert.equal(
    screen.getByTestId("playground-webview-host").getAttribute("data-user-agent"),
    PLAYGROUND_DESKTOP_UA,
  );

  await fireEvent.click(screen.getByTestId("playground-fullscreen"));
  const overlay = screen.getByTestId("playground-overlay");
  assert.equal(overlay.getAttribute("data-fullscreen"), "true");
  assert.match(overlay.className, /fixed/);
  assert.match(overlay.className, /inset-0/);
});
