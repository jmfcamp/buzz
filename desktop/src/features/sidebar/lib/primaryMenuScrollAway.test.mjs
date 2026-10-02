import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

before(() => {
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    window: dom.window,
  });
});

after(() => dom.window.close());

test("the menu dock appears only after the menu block has left the scrollport", async () => {
  const { isPrimaryMenuScrolledAway } = await import(
    "./primaryMenuScrollAway.ts"
  );

  assert.equal(isPrimaryMenuScrolledAway(200, 100), false);
  assert.equal(isPrimaryMenuScrolledAway(102, 100), false);
  assert.equal(isPrimaryMenuScrolledAway(101, 100), true);
  assert.equal(isPrimaryMenuScrolledAway(100, 100), true);
  assert.equal(isPrimaryMenuScrolledAway(40, 100), true);
});

test("an open menu stays until the in-flow block meets the expanded copy", async () => {
  const { isExpandedPrimaryMenuStillAbove } = await import(
    "./primaryMenuScrollAway.ts"
  );

  assert.equal(isExpandedPrimaryMenuStillAbove(40, 180), true);
  assert.equal(isExpandedPrimaryMenuStillAbove(178, 180), true);
  assert.equal(isExpandedPrimaryMenuStillAbove(179, 180), false);
  assert.equal(isExpandedPrimaryMenuStillAbove(180, 180), false);
  assert.equal(isExpandedPrimaryMenuStillAbove(220, 180), false);
});

test("the top of the list closes the menu", async () => {
  const { isSidebarScrolledToTop } = await import("./primaryMenuScrollAway.ts");

  assert.equal(isSidebarScrolledToTop(0), true);
  assert.equal(isSidebarScrolledToTop(1), true);
  assert.equal(isSidebarScrolledToTop(-4), true);
  assert.equal(isSidebarScrolledToTop(2), false);
});

test("scrolling to the top dismisses an open menu before the rows meet", async () => {
  const React = await import("react");
  const { act, cleanup, render, screen } = await import(
    "@testing-library/react"
  );
  const { usePrimaryMenuScrollAway } = await import(
    "./usePrimaryMenuScrollAway.ts"
  );

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };

  const scroll = document.createElement("div");
  const menu = document.createElement("div");
  document.body.append(scroll, menu);
  let scrollTop = 40;
  Object.defineProperty(scroll, "scrollTop", {
    configurable: true,
    get() {
      return scrollTop;
    },
    set(value) {
      scrollTop = value;
    },
  });
  const box = (top, bottom) => ({
    bottom,
    height: bottom - top,
    left: 0,
    right: 200,
    toJSON() {},
    top,
    width: 200,
    x: 0,
    y: top,
  });
  scroll.getBoundingClientRect = () => box(100, 500);
  menu.getBoundingClientRect = () => box(40, 80);

  const panel = document.createElement("div");
  panel.id = "sidebar-menu-dock-panel";
  const copy = document.createElement("div");
  copy.setAttribute("data-testid", "sidebar-menu-dock-rows");
  copy.getBoundingClientRect = () => box(180, 400);
  panel.append(copy);

  function Probe() {
    const away = usePrimaryMenuScrollAway(
      { current: scroll },
      { current: menu },
    );
    return React.createElement(
      "div",
      { "data-testid": "away" },
      away ? "yes" : "no",
    );
  }

  const scrollEvent = () =>
    scroll.dispatchEvent(new scroll.ownerDocument.defaultView.Event("scroll"));

  render(React.createElement(Probe));
  assert.equal(screen.getByTestId("away").textContent, "yes");

  document.body.append(panel);
  await act(async () => {
    scrollEvent();
  });
  assert.equal(screen.getByTestId("away").textContent, "yes");

  scrollTop = 0;
  await act(async () => {
    scrollEvent();
  });
  assert.equal(screen.getByTestId("away").textContent, "no");

  scrollTop = 40;
  await act(async () => {
    scrollEvent();
  });
  assert.equal(screen.getByTestId("away").textContent, "yes");

  cleanup();
  panel.remove();
  scroll.remove();
  menu.remove();
});

test("a wheel on the dock moves the sidebar, and an open panel scrolls first", async () => {
  const { applySidebarMenuDockWheel } = await import(
    "./primaryMenuScrollAway.ts"
  );

  const scroll = { scrollTop: 20 };
  let prevented = 0;
  const event = {
    deltaY: 0,
    preventDefault() {
      prevented += 1;
    },
    target: null,
  };
  applySidebarMenuDockWheel(event, scroll, null);
  assert.equal(scroll.scrollTop, 20);
  assert.equal(prevented, 0);

  event.deltaY = 15;
  applySidebarMenuDockWheel(event, scroll, null);
  assert.equal(scroll.scrollTop, 35);
  assert.equal(prevented, 1);

  const panelNode = document.createElement("div");
  const row = document.createElement("button");
  panelNode.append(row);
  const panel = {
    clientHeight: 40,
    contains: (node) => panelNode.contains(node),
    scrollHeight: 120,
    scrollTop: 0,
  };
  event.deltaY = 25;
  event.target = row;
  applySidebarMenuDockWheel(event, scroll, panel);
  assert.equal(panel.scrollTop, 25);
  assert.equal(scroll.scrollTop, 35);

  panel.scrollTop = 80;
  event.deltaY = 30;
  applySidebarMenuDockWheel(event, scroll, panel);
  assert.equal(panel.scrollTop, 80);
  assert.equal(scroll.scrollTop, 65);
});
