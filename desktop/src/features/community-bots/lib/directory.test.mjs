import assert from "node:assert/strict";
import test from "node:test";

import { truncatePubkey } from "@/shared/lib/pubkey.ts";

import {
  COMMUNITY_BOT_DIRECTORY_FORBIDDEN_ACTIONS,
  communityBotDirectoryCard,
  communityBotDirectoryDescription,
  communityBotDirectoryDetail,
  communityBotDirectoryName,
  communityBotMemberChannels,
  findCommunityDirectoryBot,
  isCommunityBotDirectoryForbiddenAction,
  resolveCommunityBotDirectoryStatus,
  visibleCommunityDirectoryBots,
} from "./directory.ts";

const MO_PUBKEY = "22".repeat(32);
const ADA_PUBKEY = "aa".repeat(32);
const ARCHIVED_PUBKEY = "bb".repeat(32);

const mo = {
  id: "mo",
  name: "Mo Desk",
  pubkey: MO_PUBKEY,
  source: "openclaw",
};

const ada = {
  id: "ada",
  name: "Ada",
  pubkey: ADA_PUBKEY,
  source: "openclaw",
};

const retired = {
  id: "retired",
  name: "Retired Bot",
  pubkey: ARCHIVED_PUBKEY,
  source: "openclaw",
};

function channel(overrides) {
  return {
    archivedAt: null,
    channelType: "stream",
    id: "general",
    memberPubkeys: [MO_PUBKEY],
    name: "general",
    ...overrides,
  };
}

test("primary directory names use the catalog, never a raw pubkey", () => {
  assert.equal(communityBotDirectoryName(mo), "Mo Desk");
  assert.equal(communityBotDirectoryName(mo, null), "Mo Desk");
  assert.equal(
    communityBotDirectoryName(mo, truncatePubkey(MO_PUBKEY)),
    "Mo Desk",
  );
  assert.equal(communityBotDirectoryName(mo, MO_PUBKEY), "Mo Desk");
  assert.equal(communityBotDirectoryName(mo, "Wayfinder"), "Wayfinder");
  assert.notEqual(communityBotDirectoryName(mo, null), MO_PUBKEY);
  assert.notEqual(
    communityBotDirectoryName(mo, null),
    truncatePubkey(MO_PUBKEY),
  );
});

test("visibleCommunityDirectoryBots hides archived identities", () => {
  const visible = visibleCommunityDirectoryBots(
    [retired, mo, ada],
    (pubkey) => pubkey === ARCHIVED_PUBKEY,
  );
  assert.deepEqual(
    visible.map((bot) => bot.id),
    ["ada", "mo"],
  );
});

test("findCommunityDirectoryBot matches catalog id or pubkey", () => {
  assert.equal(findCommunityDirectoryBot([mo, ada], "mo")?.name, "Mo Desk");
  assert.equal(findCommunityDirectoryBot([mo, ada], MO_PUBKEY)?.id, "mo");
  assert.equal(findCommunityDirectoryBot([mo], "missing"), undefined);
});

test("directory cards expose name and avatar, not a raw pubkey title", () => {
  const card = communityBotDirectoryCard(mo, {
    avatarUrl: "https://example.com/mo.png",
    displayName: truncatePubkey(MO_PUBKEY),
  });
  assert.equal(card.name, "Mo Desk");
  assert.equal(card.avatarUrl, "https://example.com/mo.png");
  assert.equal(card.id, "mo");
  assert.notEqual(card.name, MO_PUBKEY);
  assert.ok(!COMMUNITY_BOT_DIRECTORY_FORBIDDEN_ACTIONS.includes(card.name));
});

test("description is omitted when the catalog/profile about is empty", () => {
  assert.equal(communityBotDirectoryDescription(null), null);
  assert.equal(communityBotDirectoryDescription("   "), null);
  assert.equal(
    communityBotDirectoryDescription("Helps with desk work"),
    "Helps with desk work",
  );
});

test("status uses existing presence, membership, and gateway signals", () => {
  assert.deepEqual(resolveCommunityBotDirectoryStatus({ presence: "online" }), {
    id: "online",
    label: "Online",
  });
  assert.deepEqual(
    resolveCommunityBotDirectoryStatus({ presence: "offline" }),
    {
      id: "offline",
      label: "Offline",
    },
  );
  assert.deepEqual(
    resolveCommunityBotDirectoryStatus({ isRelayMember: false }),
    { id: "not_paired", label: "Not paired" },
  );
  assert.deepEqual(
    resolveCommunityBotDirectoryStatus({ gatewayState: "disconnected" }),
    { id: "not_paired", label: "Not paired" },
  );
  assert.deepEqual(resolveCommunityBotDirectoryStatus({}), {
    id: "installed",
    label: "Installed",
  });
});

test("channel list is empty when the bot is in no rooms", () => {
  assert.deepEqual(
    communityBotMemberChannels(MO_PUBKEY, [
      channel({ id: "sales", memberPubkeys: [ADA_PUBKEY], name: "sales" }),
      channel({
        archivedAt: "2026-01-01",
        id: "old",
        memberPubkeys: [MO_PUBKEY],
        name: "old",
      }),
      channel({
        channelType: "dm",
        id: "dm-1",
        memberPubkeys: [MO_PUBKEY],
        name: "dm",
      }),
    ]),
    [],
  );
});

test("channel list includes current non-archived memberships", () => {
  assert.deepEqual(
    communityBotMemberChannels(MO_PUBKEY, [
      channel({
        id: "sales",
        memberPubkeys: [MO_PUBKEY, ADA_PUBKEY],
        name: "sales",
      }),
      channel({ id: "general", memberPubkeys: [MO_PUBKEY], name: "general" }),
    ]),
    [
      { id: "general", name: "general" },
      { id: "sales", name: "sales" },
    ],
  );
});

test("detail has public key, status, and no runtime controls", () => {
  const detail = communityBotDirectoryDetail({
    bot: mo,
    channels: [channel()],
    presence: "online",
    profile: {
      about: "OpenClaw desk bot",
      avatarUrl: "https://example.com/mo.png",
      displayName: "Mo Desk",
    },
  });
  assert.equal(detail.name, "Mo Desk");
  assert.equal(detail.description, "OpenClaw desk bot");
  assert.equal(detail.hexPubkey, MO_PUBKEY);
  assert.ok(detail.npub?.startsWith("npub1"));
  assert.equal(detail.status.label, "Online");
  assert.deepEqual(detail.channels, [{ id: "general", name: "general" }]);
  for (const action of COMMUNITY_BOT_DIRECTORY_FORBIDDEN_ACTIONS) {
    assert.equal(isCommunityBotDirectoryForbiddenAction(action), true);
    assert.notEqual(detail.name, action);
    assert.notEqual(detail.status.label, action);
  }
});

test("detail omits description and reports no channels when those are empty", () => {
  const detail = communityBotDirectoryDetail({
    bot: mo,
    channels: [],
    profile: { about: "  " },
  });
  assert.equal(detail.description, null);
  assert.deepEqual(detail.channels, []);
  assert.equal(detail.status.label, "Installed");
});
