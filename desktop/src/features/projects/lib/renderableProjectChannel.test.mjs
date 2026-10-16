import assert from "node:assert/strict";
import test from "node:test";
import { isRenderableProjectChannel } from "./renderableProjectChannel.ts";

test("hides archived and unresolvable channels; keeps live ones", () => {
  assert.equal(isRenderableProjectChannel({ archivedAt: null }), true);
  assert.equal(
    isRenderableProjectChannel({ archivedAt: "2026-10-16T00:16:31Z" }),
    false,
  );
  assert.equal(isRenderableProjectChannel(undefined), false);
  assert.equal(isRenderableProjectChannel(undefined, true), true);
});
