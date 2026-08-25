import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import { JSDOM } from "jsdom";

import { installLocalStorage } from "../../playground/lib/testStorage.mjs";

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
  const { resetPopoutWindowsForTests } = await import(
    "../lib/popoutWindows.ts"
  );
  resetPopoutWindowsForTests();
  globalThis.localStorage?.clear();
});

after(() => dom.window.close());

async function renderSection() {
  const { createElement } = await import("react");
  const { render, screen } = await import("@testing-library/react");
  const { SidebarProvider } = await import("@/shared/ui/sidebar.tsx");
  const { TooltipProvider } = await import("@/shared/ui/tooltip.tsx");
  const { WindowsSection } = await import("./WindowsSection.tsx");
  render(
    createElement(
      TooltipProvider,
      null,
      createElement(SidebarProvider, null, createElement(WindowsSection)),
    ),
  );
  return screen;
}

test("Windows section is hidden when empty and visible with a pop-out", async () => {
  const screen = await renderSection();
  assert.equal(screen.queryByTestId("windows-section"), null);

  const { act } = await import("@testing-library/react");
  const { setPopoutWindowsForTests } = await import("../lib/popoutWindows.ts");
  await act(() => {
    setPopoutWindowsForTests([
      { label: "main", title: "Buzz" },
      { label: "popout-thread-aaa", title: "Thread" },
    ]);
  });
  assert.ok(screen.getByTestId("windows-section"));
  assert.equal(
    screen.getByTestId("windows-section-label").textContent,
    "Windows",
  );
  assert.ok(screen.getByTestId("open-window-popout-thread-aaa"));
  assert.equal(screen.queryByTestId("open-window-main"), null);
});

test("Clearing the last pop-out hides the Windows section", async () => {
  const { act } = await import("@testing-library/react");
  const { setPopoutWindowsForTests } = await import("../lib/popoutWindows.ts");
  setPopoutWindowsForTests([{ label: "popout-playground-bbb", title: "Demo" }]);
  const screen = await renderSection();
  assert.ok(screen.getByTestId("windows-section"));
  await act(() => {
    setPopoutWindowsForTests([]);
  });
  assert.equal(screen.queryByTestId("windows-section"), null);
});
