import assert from "node:assert/strict";
import test from "node:test";

import { HULA_RESERVED_COMMUNITY_BOT_PUBKEYS } from "../../agents/lib/reservedCommunityMentionRouting.ts";
import {
  humanRelayDriCandidates,
  requireProjectDri,
  replaceProjectDriTag,
  withProjectDriTag,
} from "./projectDri.ts";

const HUMAN = "a".repeat(64);
const AGENT = "b".repeat(64);
const BOT = "c".repeat(64);
const OWNED = "d".repeat(64);
const MISSING = "e".repeat(64);

test("requireProjectDri accepts only a hex pubkey", () => {
  assert.equal(requireProjectDri(HUMAN.toUpperCase()), HUMAN);
  assert.throws(() => requireProjectDri(""), /DRI/);
  assert.throws(() => requireProjectDri("jm"), /DRI/);
});

test("withProjectDriTag adds one dri tag and keeps an existing one", () => {
  const added = withProjectDriTag(
    [
      ["d", "products-hulabill"],
      ["dri", "not-a-key"],
    ],
    HUMAN,
  );
  assert.deepEqual(
    added.filter((tag) => tag[0] === "dri"),
    [["dri", HUMAN]],
  );
  const kept = withProjectDriTag(
    [
      ["d", "products-hulabill"],
      ["dri", BOT],
    ],
    HUMAN,
  );
  assert.deepEqual(
    kept.filter((tag) => tag[0] === "dri"),
    [["dri", BOT]],
  );
});

test("human DRI candidates are relay members with a settled non-agent profile", () => {
  const candidates = humanRelayDriCandidates({
    excludedPubkeys: new Set([BOT]),
    members: [
      { pubkey: HUMAN },
      { pubkey: AGENT },
      { pubkey: BOT },
      { pubkey: OWNED },
      { pubkey: MISSING },
      { pubkey: "nope" },
    ],
    profiles: {
      [HUMAN]: { displayName: "JM", isAgent: false, ownerPubkey: null },
      [AGENT]: { displayName: "Claw", isAgent: true, ownerPubkey: null },
      [BOT]: { displayName: "Bot", isAgent: false, ownerPubkey: null },
      [OWNED]: { displayName: "Owned", isAgent: false, ownerPubkey: HUMAN },
    },
    sourcesReady: true,
  });
  assert.deepEqual(
    candidates.map((candidate) => candidate.pubkey),
    [HUMAN],
  );
  assert.deepEqual(
    humanRelayDriCandidates({
      excludedPubkeys: new Set(),
      members: [{ pubkey: HUMAN }],
      profiles: {
        [HUMAN]: { displayName: "JM", isAgent: false, ownerPubkey: null },
      },
      sourcesReady: false,
    }),
    [],
  );
});


test("a community bot pubkey is filtered even when its profile looks human", () => {
  const communityBot = "c".repeat(64);
  const byKind = "f".repeat(64);
  const byNip05 = "1".repeat(64);
  const candidates = humanRelayDriCandidates({
    communityBotPubkeys: new Set([communityBot]),
    excludedPubkeys: new Set(),
    members: [
      { pubkey: HUMAN },
      { pubkey: communityBot },
      { pubkey: byKind, kind: "bot" },
      { pubkey: byNip05 },
    ],
    profiles: {
      [HUMAN]: { displayName: "JM", isAgent: false, ownerPubkey: null },
      [communityBot]: {
        displayName: "Mo",
        isAgent: false,
        nip05Handle: null,
        ownerPubkey: null,
      },
      [byKind]: { displayName: "Kind Bot", isAgent: false, ownerPubkey: null },
      [byNip05]: {
        displayName: "Nip Bot",
        isAgent: false,
        kind: "person",
        nip05Handle: "captain.bot@buzz.huladesk.com",
        ownerPubkey: null,
      },
    },
    sourcesReady: true,
  });
  assert.deepEqual(
    candidates.map((candidate) => candidate.pubkey),
    [HUMAN],
  );
});

test("replaceProjectDriTag overwrites an existing DRI", () => {
  const next = replaceProjectDriTag(
    [
      ["d", "products-hulabill"],
      ["dri", HUMAN],
    ],
    AGENT,
  );
  assert.deepEqual(
    next.filter((tag) => tag[0] === "dri"),
    [["dri", AGENT]],
  );
});

test("a community-bot pubkey that is also a relay member is not a DRI option", () => {
  const bots = Object.entries(HULA_RESERVED_COMMUNITY_BOT_PUBKEYS);
  const profiles = {
    [HUMAN]: { displayName: "JM", isAgent: false, ownerPubkey: null },
  };
  const members = [{ pubkey: HUMAN }];
  for (const [name, pubkey] of bots) {
    members.push({ pubkey, role: "member" });
    profiles[pubkey] = {
      displayName: name,
      isAgent: false,
      kind: "person",
      nip05Handle: null,
      ownerPubkey: null,
    };
  }
  const candidates = humanRelayDriCandidates({
    excludedPubkeys: new Set(),
    members,
    profiles,
    sourcesReady: true,
  });
  assert.deepEqual(
    candidates.map((candidate) => candidate.pubkey),
    [HUMAN],
  );
  for (const [, pubkey] of bots) {
    assert.equal(
      candidates.some((candidate) => candidate.pubkey === pubkey),
      false,
      pubkey,
    );
  }
});
