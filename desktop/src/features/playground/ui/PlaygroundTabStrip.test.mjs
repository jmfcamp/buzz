import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";

import { addTabToBrowser, createOneTabBrowser } from "../lib/browserGroups.ts";
import { installLocalStorage } from "../lib/testStorage.mjs";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

before(() => {
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    MutationObserver: dom.window.MutationObserver,
    window: dom.window,
  });
  installLocalStorage(dom.window.localStorage);
});

afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});

after(() => {
  delete globalThis.document;
  delete globalThis.window;
});

test("main tab has no close; secondary has close; no add button", async () => {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  const { PlaygroundTabStrip } = await import("./PlaygroundTabStrip.tsx");

  const browser = addTabToBrowser(createOneTabBrowser("main"), "extra");
  const sessions = new Map([
    [
      "main",
      { sid: "main", name: "Main", url: "https://a.example", hasUpdate: false },
    ],
    [
      "extra",
      {
        sid: "extra",
        name: "Extra",
        url: "https://b.example",
        hasUpdate: false,
      },
    ],
  ]);

  render(
    createElement(PlaygroundTabStrip, {
      browser,
      sessions,
      onSelect() {},
      onClose() {},
    }),
  );

  assert.ok(screen.getByTestId("playground-tab-main"));
  assert.equal(screen.queryByTestId("playground-tab-close-main"), null);
  assert.ok(screen.getByTestId("playground-tab-close-extra"));
  assert.equal(screen.queryByTestId("playground-tab-add"), null);
  assert.equal(
    screen.getByTestId("playground-tab-main").getAttribute("data-main-tab"),
    "true",
  );
});
