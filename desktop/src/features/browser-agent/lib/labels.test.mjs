import assert from "node:assert/strict";
import test from "node:test";

import { browserWebviewLabel, pinWebviewLabelForWindow } from "./labels.ts";

test("playground label uses window suffix off main", () => {
  assert.equal(
    browserWebviewLabel({ surface: "playground", surfaceId: "demo" }),
    "playground-demo",
  );
  assert.equal(
    browserWebviewLabel({
      surface: "playground",
      surfaceId: "demo",
      windowLabel: "pop-1",
    }),
    "playground-demo--pop-1",
  );
});

test("pin label mirrors playground window scoping", () => {
  assert.equal(pinWebviewLabelForWindow("wayfinder"), "pin-wayfinder");
  assert.equal(
    pinWebviewLabelForWindow("wayfinder", "pop-1"),
    "pin-wayfinder--pop-1",
  );
});
