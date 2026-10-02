import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

const resizeObservers = [];

before(() => {
  class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
      resizeObservers.push(this);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    Node: dom.window.Node,
    ResizeObserver,
    window: dom.window,
  });
});

after(() => dom.window.close());

function rect(top, bottom) {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 100,
    top,
    width: 100,
    x: 0,
    y: top,
    toJSON() {
      return {};
    },
  };
}

test("scroll and resize hide the dock again when the menu re-enters", async () => {
  const { act, renderHook } = await import("@testing-library/react");
  const { usePrimaryMenuScrollAway } = await import(
    "./usePrimaryMenuScrollAway.ts"
  );

  const scroll = document.createElement("div");
  const menu = document.createElement("div");
  document.body.append(scroll, menu);
  scroll.getBoundingClientRect = () => rect(100, 800);
  menu.getBoundingClientRect = () => rect(100, 280);

  const { result } = renderHook(() =>
    usePrimaryMenuScrollAway({ current: scroll }, { current: menu }),
  );
  assert.equal(result.current, false);

  menu.getBoundingClientRect = () => rect(20, 100);
  await act(async () => {
    scroll.dispatchEvent(new window.Event("scroll"));
  });
  assert.equal(result.current, true);

  menu.getBoundingClientRect = () => rect(100, 260);
  assert.ok(resizeObservers.length > 0);
  await act(async () => {
    for (const observer of resizeObservers) observer.callback();
  });
  assert.equal(result.current, false);
});

test("an open menu holds until its rows meet the expanded rows", async () => {
  const { act, renderHook } = await import("@testing-library/react");
  const { usePrimaryMenuScrollAway } = await import(
    "./usePrimaryMenuScrollAway.ts"
  );

  const scroll = document.createElement("div");
  const menu = document.createElement("div");
  const panel = document.createElement("div");
  const copy = document.createElement("div");
  panel.id = "sidebar-menu-dock-panel";
  copy.setAttribute("data-testid", "sidebar-menu-dock-rows");
  panel.append(copy);
  document.body.append(scroll, menu, panel);
  scroll.getBoundingClientRect = () => rect(100, 800);
  menu.getBoundingClientRect = () => rect(40, 160);
  copy.getBoundingClientRect = () => rect(180, 360);

  try {
    const { result } = renderHook(() =>
      usePrimaryMenuScrollAway({ current: scroll }, { current: menu }),
    );
    assert.equal(result.current, true);

    menu.getBoundingClientRect = () => rect(179, 299);
    await act(async () => {
      scroll.dispatchEvent(new window.Event("scroll"));
    });
    assert.equal(result.current, false);
  } finally {
    panel.remove();
    scroll.remove();
    menu.remove();
  }
});
