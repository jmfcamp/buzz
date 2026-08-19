import assert from "node:assert/strict";
import test from "node:test";

import {
  MIN_PIN_WEBVIEW_EDGE,
  pinWebviewBoundsAreUsable,
} from "./pinWebview.ts";

test("pinWebviewBoundsAreUsable rejects a 1×1 first layout", () => {
  assert.equal(MIN_PIN_WEBVIEW_EDGE, 32);
  assert.equal(
    pinWebviewBoundsAreUsable({ x: 0, y: 0, width: 1, height: 1 }),
    false,
  );
  assert.equal(
    pinWebviewBoundsAreUsable({ x: 0, y: 0, width: 16, height: 400 }),
    false,
  );
  assert.equal(
    pinWebviewBoundsAreUsable({ x: 240, y: 36, width: 800, height: 600 }),
    true,
  );
});
