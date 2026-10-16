import assert from "node:assert/strict";
import { test } from "node:test";

import { communityBotCardSubtitle, communityBotDirectoryCard } from "./directory.ts";
import { descriptionField } from "./types.ts";

const PK = "a".repeat(64);
const bot = (extra = {}) => ({ id: "main", name: "Captain", pubkey: PK, source: "openclaw", ...extra });

test("descriptionField trims, caps and omits empty", () => {
  assert.deepEqual(descriptionField(""), {});
  assert.deepEqual(descriptionField(undefined), {});
  assert.equal(descriptionField("y".repeat(500)).description.length, 160);
});

test("card subtitle: install description > about > active > nothing", () => {
  const now = 1_000_000_000_000;
  const card = (b, profile) => communityBotDirectoryCard(b, profile, {});
  assert.equal(communityBotCardSubtitle(card(bot({ description: "Ops" }), { about: "About" })), "Ops");
  assert.equal(communityBotCardSubtitle(card(bot(), { about: "About" })), "About");
  assert.equal(communityBotCardSubtitle({ ...card(bot(), {}), lastActiveAt: now / 1000 - 300 }, now), "Active 5m ago");
  assert.equal(communityBotCardSubtitle({ ...card(bot(), {}), lastActiveAt: now / 1000 - 7200 }, now), "Active 2h ago");
  assert.equal(communityBotCardSubtitle(card(bot(), {})), null);
});
