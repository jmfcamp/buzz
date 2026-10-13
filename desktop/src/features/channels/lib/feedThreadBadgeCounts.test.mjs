import assert from "node:assert/strict";
import test from "node:test";

import { mergeFeedThreadBadgeCounts } from "./feedThreadBadgeCounts.ts";

const reply = (id, root, pubkey = "bob", channelId = "c1") => ({
  id,
  pubkey,
  createdAt: 100,
  channelId,
  tags: [
    ["e", root, "", "root"],
    ["e", root, "", "reply"],
  ],
});

const opts = {
  channelId: "c1",
  topLevelIds: new Set(["r1", "r2"]),
  isNotified: (id) => id !== "r2",
  currentPubkey: "ME",
};

test("counts unread feed replies per root when local has none", () => {
  const out = mergeFeedThreadBadgeCounts(
    new Map(),
    [reply("a", "r1"), reply("b", "r1"), reply("a", "r1")],
    opts,
  );
  assert.equal(out.get("r1"), 2);
});

test("skips own, other channel, muted, unknown root; never lowers local", () => {
  const out = mergeFeedThreadBadgeCounts(
    new Map([["r1", 5]]),
    [
      reply("a", "r1"),
      reply("b", "r1", "me"),
      reply("c", "r1", "bob", "c2"),
      reply("d", "r2"),
      reply("e", "zz"),
    ],
    opts,
  );
  assert.equal(out.get("r1"), 5);
  assert.equal(out.has("r2"), false);
  assert.equal(out.has("zz"), false);
});
