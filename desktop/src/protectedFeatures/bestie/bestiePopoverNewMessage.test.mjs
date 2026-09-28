import assert from "node:assert/strict";
import test from "node:test";

import { resolveBestiePopoverNewMessageTarget } from "./bestiePopoverNewMessage.ts";

test("outside-session message wins even when near bottom", () => {
  const target = resolveBestiePopoverNewMessageTarget({
    allMessages: [
      { id: "in", createdAt: 10 },
      { id: "out", createdAt: 20 },
    ],
    sessionMessageIds: new Set(["in"]),
    sessionRootId: "in",
    nearBottom: true,
  });
  assert.deepEqual(target, { id: "out", outsideSession: true });
});

test("in-session below fold offers jump when not near bottom", () => {
  const target = resolveBestiePopoverNewMessageTarget({
    allMessages: [
      { id: "a", createdAt: 10 },
      { id: "b", createdAt: 20 },
    ],
    sessionMessageIds: new Set(["a", "b"]),
    sessionRootId: "a",
    nearBottom: false,
  });
  assert.deepEqual(target, { id: "b", outsideSession: false });
});

test("near bottom with only in-session messages hides banner", () => {
  const target = resolveBestiePopoverNewMessageTarget({
    allMessages: [{ id: "a", createdAt: 10 }],
    sessionMessageIds: new Set(["a"]),
    sessionRootId: "a",
    nearBottom: true,
  });
  assert.equal(target, null);
});
