import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";

import { JSDOM } from "jsdom";

import { PinnedSiteLoadError } from "./PinnedSiteScreen.tsx";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

before(() => {
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    window: dom.window,
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

test("PinnedSiteLoadError shows the failure and retries start_url", async () => {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  let retried = 0;
  render(
    createElement(PinnedSiteLoadError, {
      message: "The page did not load.",
      onRetry: () => {
        retried += 1;
      },
    }),
  );
  assert.ok(screen.getByTestId("pinned-site-load-error"));
  assert.match(
    screen.getByTestId("pinned-site-load-error").textContent ?? "",
    /The page did not load/,
  );
  screen.getByTestId("pinned-site-load-error-retry").click();
  assert.equal(retried, 1);
});
