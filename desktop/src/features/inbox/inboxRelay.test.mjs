import assert from "node:assert/strict";
import test from "node:test";

import { parseBuzzInboxInfo, parseBuzzInboxPage } from "./inboxRelay.ts";

test("capability needs buzz_inbox.version 1", () => {
  assert.equal(parseBuzzInboxInfo({ buzz_inbox: { version: 1 } }), true);
  assert.equal(parseBuzzInboxInfo({ buzz_inbox: { version: 2 } }), false);
  assert.equal(parseBuzzInboxInfo({}), false);
  assert.equal(parseBuzzInboxInfo(null), false);
});

test("page parse keeps known categories and next_until", () => {
  const ev = {
    id: "a",
    kind: 9,
    pubkey: "p",
    content: "",
    created_at: 5,
    tags: [],
  };
  const page = parseBuzzInboxPage({
    buzz_inbox: 1,
    items: [
      { category: "dm", event: ev },
      { category: "bogus", event: ev },
      { category: "mention" },
    ],
    next_until: 5,
  });
  assert.deepEqual(
    page.items.map((i) => i.category),
    ["dm"],
  );
  assert.equal(page.nextUntil, 5);
  assert.equal(parseBuzzInboxPage([]), null);
  assert.equal(
    parseBuzzInboxPage({ buzz_inbox: 1, items: [] }).nextUntil,
    null,
  );
});
