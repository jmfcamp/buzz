import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCommunityBotCandidates,
  channelRoleForAddMember,
  COMMUNITY_BOT_CHANNEL_ROLE,
  communityBotAddMemberInput,
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

test("appendCommunityBotCandidates does not resurrect archived catalog pubkeys", () => {
  const leftover = {
    id: "old-mo",
    name: "Mo",
    pubkey: "11".repeat(32),
    source: "openclaw",
  };
  const merged = appendCommunityBotCandidates([], [mo, leftover], "mo", {
    isArchived: (pubkey) => pubkey === leftover.pubkey,
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].pubkey, mo.pubkey);
});

test("channel add of a catalog bot sends role bot", () => {
  assert.equal(COMMUNITY_BOT_CHANNEL_ROLE, "bot");
  assert.deepEqual(communityBotAddMemberInput(mo.pubkey), {
    pubkeys: [mo.pubkey],
    role: "bot",
  });
  assert.equal(
    channelRoleForAddMember({ pubkey: mo.pubkey, isAgent: true }, [mo]),
    "bot",
  );
  assert.equal(
    channelRoleForAddMember({ pubkey: mo.pubkey, isAgent: false }, [mo]),
    "bot",
  );
  assert.equal(
    channelRoleForAddMember({ pubkey: "aa".repeat(32), isAgent: false }, [mo]),
    "member",
  );
});
