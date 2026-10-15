import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";

const { hasOpenPopup } = await import("./menuKeyboard.ts");

function dom(html) {
  return new JSDOM(`<body>${html}</body>`).window.document;
}
const W = (inner) => `<div data-radix-popper-content-wrapper>${inner}</div>`;

test("closing (exit-animating) menu popper is not an open popup", () => {
  assert.equal(hasOpenPopup(dom(W('<div role="menu" data-state="closed"></div>'))), false);
});
test("open menu popper is an open popup", () => {
  assert.equal(hasOpenPopup(dom(W('<div role="menu" data-state="open"></div>'))), true);
});
test("tooltip popper is ignored", () => {
  assert.equal(hasOpenPopup(dom(W('<div role="tooltip" data-state="delayed-open"></div>'))), false);
});
test("no popper", () => {
  assert.equal(hasOpenPopup(dom("<div></div>")), false);
});
