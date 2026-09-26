import assert from "node:assert/strict";
import test from "node:test";

import { driveActivityCaption } from "./driveActivityCaption.ts";

test("drive_started and snapshot openers", () => {
  assert.equal(driveActivityCaption("drive_started"), "Driving…");
  assert.equal(driveActivityCaption("snapshot"), "Taking snapshot…");
});

test("drive_error is brief", () => {
  assert.equal(
    driveActivityCaption("drive_error", { kind: "click", error: "no element" }),
    "Action failed",
  );
});

test("navigate uses host", () => {
  assert.equal(
    driveActivityCaption("drive", {
      kind: "navigate",
      url: "https://example.com/path?q=1",
    }),
    "Opening example.com…",
  );
});

test("click prefers hit name then role then tag then coords", () => {
  assert.equal(
    driveActivityCaption("drive", {
      kind: "click",
      hit: { tag: "button", role: "button", name: "Submit form" },
    }),
    "Clicking Submit form…",
  );
  assert.equal(
    driveActivityCaption("drive", {
      kind: "click",
      hit: { tag: "a", role: "link" },
    }),
    "Clicking link…",
  );
  assert.equal(
    driveActivityCaption("drive", {
      kind: "click",
      hit: { tag: "div" },
    }),
    "Clicking <div>…",
  );
  assert.equal(
    driveActivityCaption("drive", { kind: "clickAt", x: 10.2, y: 20.8 }),
    "Clicking (10, 21)…",
  );
});

test("hover / type / key / scroll / waitFor", () => {
  assert.equal(
    driveActivityCaption("drive", {
      kind: "hover",
      hit: { tag: "button", name: "Menu" },
    }),
    "Moving to Menu…",
  );
  assert.equal(driveActivityCaption("drive", { kind: "type" }), "Typing…");
  assert.equal(
    driveActivityCaption("drive", { kind: "type", text: "hello" }),
    "Typing…",
  );
  assert.equal(
    driveActivityCaption("drive", { kind: "key", key: "Enter" }),
    "Pressing Enter",
  );
  assert.equal(driveActivityCaption("drive", { kind: "scroll" }), "Scrolling…");
  assert.equal(driveActivityCaption("drive", { kind: "waitFor" }), "Waiting…");
});

test("non-drive observe kinds are ignored", () => {
  assert.equal(driveActivityCaption("nav", { url: "https://x.test" }), null);
  assert.equal(driveActivityCaption("console"), null);
  assert.equal(driveActivityCaption("network"), null);
});
