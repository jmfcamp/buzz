import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const { isSidebarDrawerViewport } = await import("@/shared/hooks/use-mobile");
const { isDrawerDismissSwipe, shouldCloseDrawerOnTap } = await import(
  "./sidebarDrawerClose.ts"
);

const touch = (width, height) =>
  isSidebarDrawerViewport({ coarse: true, height, width });
const mouse = (width, height) =>
  isSidebarDrawerViewport({ coarse: false, height, width });

test("every iPhone orientation gets the slide-in drawer, not the inline sidebar", () => {
  // Landscape: 667 (SE), 740 (Display Zoom), 844 (12–14), 852 (15/16), 932 (Plus/Pro Max), 1000x461 (JM's report).
  for (const [w, h] of [
    [667, 375],
    [740, 360],
    [844, 390],
    [852, 393],
    [932, 430],
    [1000, 461],
  ]) {
    assert.equal(touch(w, h), true, `${w}x${h} landscape`);
  }
  for (const [w, h] of [
    [375, 667],
    [390, 844],
    [430, 932],
  ]) {
    assert.equal(touch(w, h), true, `${w}x${h} portrait`);
  }
});

test("iPads and mouse/trackpad layouts keep the width rule", () => {
  assert.equal(touch(1024, 768), false, "iPad landscape");
  assert.equal(touch(768, 1024), false, "iPad portrait");
  assert.equal(touch(1180, 820), false, "iPad Air landscape");
  assert.equal(
    touch(744, 1133),
    true,
    "iPad mini portrait is < 768 wide, as before",
  );
  assert.equal(mouse(844, 390), false, "short desktop window with a mouse");
  assert.equal(mouse(1440, 900), false, "desktop");
  assert.equal(mouse(700, 900), true, "narrow desktop window, as before");
});

function drawer() {
  const dom = new JSDOM(`<!doctype html><div id="drawer">
    <button data-sidebar="menu-button" id="inbox"><span id="inbox-label">Inbox</span></button>
    <button data-sidebar="menu-button" data-active="true" id="term">Buzz term</button>
    <a href="/channels/general" id="channel">#general</a>
    <button data-sidebar="menu-button" id="row-with-action">Projects<button data-sidebar="menu-action" id="row-plus">+</button></button>
    <div aria-haspopup="menu" id="ctx"><button data-sidebar="menu-button" id="ctx-row">Agents</button></div>
    <button aria-expanded="true" data-sidebar="menu-button" id="section">Channels ▾</button>
    <button aria-haspopup="menu" data-sidebar="menu-button" id="me">JM</button>
    <button data-sidebar="group-action" id="add">+</button>
    <input id="search" />
    <button data-sidebar="menu-button" aria-disabled="true" id="off">Off</button>
    <div id="bg">background</div>
  </div><button data-sidebar="menu-button" id="outside">Outside</button>`);
  const doc = dom.window.document;
  const root = doc.getElementById("drawer");
  return {
    close: (id) => shouldCloseDrawerOnTap(doc.getElementById(id), root),
  };
}

test("tapping a nav row closes the drawer, including the row you're already on", () => {
  const { close } = drawer();
  assert.equal(close("inbox"), true);
  assert.equal(close("inbox-label"), true, "tap on the row's label");
  assert.equal(close("term"), true, "current row (Buzz term) still closes");
  assert.equal(close("channel"), true);
  assert.equal(
    close("ctx-row"),
    true,
    "a row wrapped in a long-press menu trigger",
  );
});

test("controls that open something in place keep the drawer open", () => {
  const { close } = drawer();
  assert.equal(close("row-plus"), false, "row + action");
  assert.equal(close("section"), false, "section disclosure");
  assert.equal(
    close("me"),
    false,
    "footer account menu (its Settings item closes by route change)",
  );
  assert.equal(close("add"), false, "group + action");
  assert.equal(close("search"), false, "search field");
  assert.equal(close("off"), false, "disabled row");
  assert.equal(close("bg"), false, "drawer background");
  assert.equal(close("outside"), false, "outside the drawer");
});

test("a leftward swipe dismisses the left drawer; vertical scrolls and short drags don't", () => {
  assert.equal(isDrawerDismissSwipe(-80, 10), true);
  assert.equal(isDrawerDismissSwipe(-40, 0), false, "too short");
  assert.equal(
    isDrawerDismissSwipe(-80, 120),
    false,
    "mostly vertical (scrolling the list)",
  );
  assert.equal(isDrawerDismissSwipe(90, 0), false, "rightward");
  assert.equal(
    isDrawerDismissSwipe(90, 0, "right"),
    true,
    "right-side drawer mirrors",
  );
});
