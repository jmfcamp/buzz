import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCommunityBotCandidates,
  communityBotAllowedPubkeys,
  communityBotMatchesQuery,
} from "./addCandidates.ts";

const mo = {
  id: "mo",
  name: "Mo",
  pubkey: "22".repeat(32),
  source: "openclaw",
};

test("community bots match id and name queries of at least 2 chars", () => {
  assert.equal(communityBotMatchesQuery(mo, "m"), false);
  assert.equal(communityBotMatchesQuery(mo, "mo"), true);
  assert.equal(communityBotMatchesQuery(mo, "Mo"), true);
});

test("appendCommunityBotCandidates injects installed bots for add-member search", () => {
  const merged = appendCommunityBotCandidates([], [mo], "mo");
  assert.equal(merged.length, 1);
  assert.equal(merged[0].pubkey, mo.pubkey);
  assert.equal(merged[0].displayName, "Mo");
  assert.equal(merged[0].isAgent, true);
  assert.deepEqual(communityBotAllowedPubkeys([mo]), [mo.pubkey]);
});
