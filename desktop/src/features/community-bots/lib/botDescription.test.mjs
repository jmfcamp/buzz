import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCommunityBotsPayload, serializeCommunityBot } from "./catalog.ts";
import { communityBotCardSubtitle, communityBotDirectoryCard } from "./directory.ts";
import { descriptionField } from "./installFlow.ts";

const PK = "a".repeat(64);
const bot = (extra = {}) => ({ id: "main", name: "Captain", pubkey: PK, source: "openclaw", ...extra });

test("catalog keeps an install description and drops an empty one", () => {
  const [withDesc] = parseCommunityBotsPayload(JSON.stringify({ version: 1, bots: [bot({ description: "  Ops lead  " })] }));
  assert.equal(withDesc.description, "Ops lead");
  const [noDesc] = parseCommunityBotsPayload(JSON.stringify({ version: 1, bots: [bot({ description: "  " })] }));
  assert.equal("description" in noDesc, false);
  assert.deepEqual(serializeCommunityBot(bot()), bot());
  assert.equal(serializeCommunityBot(bot({ description: "x" })).description, "x");
});

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
