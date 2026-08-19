import assert from "node:assert/strict";
import test from "node:test";

import { truncatePubkey } from "@/shared/lib/pubkey.ts";

import {
  collectCommunityAgents,
  isLeftoverCommunityAgentMember,
} from "./communityAgents.ts";

const MO_PUBKEY = "22".repeat(32);
const OLD_MO_PUBKEY = "11".repeat(32);
const ADA_PUBKEY = "aa".repeat(32);

const moBot = {
  id: "mo",
  name: "mo",
  pubkey: MO_PUBKEY,
};

test("leftover detection keeps bot-role and agent members, not people", () => {
  assert.equal(
    isLeftoverCommunityAgentMember({
      pubkey: OLD_MO_PUBKEY,
      role: "bot",
      isAgent: false,
    }),
    true,
  );
  assert.equal(
    isLeftoverCommunityAgentMember({
      pubkey: OLD_MO_PUBKEY,
      role: "member",
      isAgent: true,
    }),
    true,
  );
  assert.equal(
    isLeftoverCommunityAgentMember(
      { pubkey: OLD_MO_PUBKEY, role: "member", isAgent: false },
      { isAgent: true },
    ),
    true,
  );
  assert.equal(
    isLeftoverCommunityAgentMember({
      pubkey: ADA_PUBKEY,
      role: "member",
      isAgent: false,
    }),
    false,
  );
  assert.equal(
    isLeftoverCommunityAgentMember({
      pubkey: ADA_PUBKEY,
      role: "admin",
      isAgent: false,
    }),
    false,
  );
});

test("settings list includes leftover bot-role members that are not in the catalog", () => {
  const items = collectCommunityAgents({
    catalogBots: [moBot],
    leftoverMembers: [
      {
        pubkey: OLD_MO_PUBKEY,
        displayName: "Mo",
        role: "bot",
        isAgent: false,
      },
      {
        pubkey: ADA_PUBKEY,
        displayName: "Ada",
        role: "member",
        isAgent: false,
      },
    ],
  });

  assert.equal(items.length, 2);
  const leftover = items.find((item) => item.pubkey === OLD_MO_PUBKEY);
  const catalog = items.find((item) => item.pubkey === MO_PUBKEY);
  assert.deepEqual(
    { ...leftover, truncatedPubkey: leftover?.truncatedPubkey },
    {
      pubkey: OLD_MO_PUBKEY,
      displayName: "Mo",
      truncatedPubkey: truncatePubkey(OLD_MO_PUBKEY),
      archived: false,
      source: "leftover",
    },
  );
  assert.deepEqual(
    { ...catalog, truncatedPubkey: catalog?.truncatedPubkey },
    {
      pubkey: MO_PUBKEY,
      displayName: "mo",
      truncatedPubkey: truncatePubkey(MO_PUBKEY),
      archived: false,
      source: "catalog",
      catalogId: "mo",
    },
  );
  assert.equal(
    items.some((item) => item.pubkey === ADA_PUBKEY),
    false,
  );
});

test("catalog row wins when the same pubkey is also a leftover channel member", () => {
  const items = collectCommunityAgents({
    catalogBots: [moBot],
    leftoverMembers: [
      {
        pubkey: MO_PUBKEY,
        displayName: "Old label",
        role: "bot",
        isAgent: true,
      },
    ],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].source, "catalog");
  assert.equal(items[0].displayName, "mo");
  assert.equal(items[0].catalogId, "mo");
});

test("archived state follows the NIP-IA snapshot for catalog and leftover agents", () => {
  const items = collectCommunityAgents({
    catalogBots: [moBot],
    leftoverMembers: [
      {
        pubkey: OLD_MO_PUBKEY,
        displayName: "Mo",
        role: "bot",
      },
    ],
    archivedPubkeys: [OLD_MO_PUBKEY.toUpperCase()],
  });

  const leftover = items.find((item) => item.pubkey === OLD_MO_PUBKEY);
  const live = items.find((item) => item.pubkey === MO_PUBKEY);
  assert.equal(leftover?.archived, true);
  assert.equal(live?.archived, false);
});
