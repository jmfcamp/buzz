import assert from "node:assert/strict";
import test from "node:test";

import { DIRECT_CONTROLS_HINT } from "./DesktopData.tsx";

test("DIRECT_CONTROLS_HINT is a short calm Needs Direct title", () => {
  assert.equal(DIRECT_CONTROLS_HINT, "Needs a Direct connection");
  assert.ok(DIRECT_CONTROLS_HINT.length < 40);
});
