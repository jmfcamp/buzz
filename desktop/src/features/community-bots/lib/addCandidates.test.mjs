import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCommunityBotCandidates,
  appendCommunityBotDmPeers,
  channelRoleForAddMember,
  COMMUNITY_BOT_CHANNEL_ROLE,
  communityBotAddMemberInput,
  communityBotAllowedPubkeys,
  communityBotMatchesDmQuery,
  communityBotMatchesQuery,
  communityBotPeerCandidate,
  isEligibleNewMessageRecipient,
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

test("community bots are valid DM peers under the last-mile pubkey", () => {
  assert.equal(communityBotMatchesDmQuery(mo, ""), true);
  assert.equal(communityBotMatchesDmQuery(mo, "Mo"), true);
  assert.equal(communityBotMatchesDmQuery(mo, "captain"), false);

  const peer = communityBotPeerCandidate(mo);
  assert.equal(peer.pubkey, mo.pubkey);
  assert.notEqual(peer.pubkey, mo.id);
  assert.equal(peer.displayName, "Mo");
  assert.equal(peer.isAgent, true);

  const directory = appendCommunityBotDmPeers([], [mo], "");
  assert.equal(directory.length, 1);
  assert.equal(directory[0].pubkey, mo.pubkey);
  assert.equal(directory[0].displayName, "Mo");
});

test("catalog bots stay eligible for new DMs without mentionable-agent gating", () => {
  const emptyAgents = new Set();
  assert.equal(
    isEligibleNewMessageRecipient({
      pubkey: mo.pubkey,
      isAgent: true,
      eligibleAgentPubkeys: emptyAgents,
      communityBots: [mo],
    }),
    true,
  );
  assert.equal(
    isEligibleNewMessageRecipient({
      pubkey: "aa".repeat(32),
      isAgent: true,
      eligibleAgentPubkeys: emptyAgents,
      communityBots: [mo],
    }),
    false,
  );
  assert.equal(
    isEligibleNewMessageRecipient({
      pubkey: "aa".repeat(32),
      isAgent: false,
      eligibleAgentPubkeys: emptyAgents,
      communityBots: [mo],
    }),
    true,
  );
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
