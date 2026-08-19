import assert from "node:assert/strict";
import test from "node:test";

import { truncatePubkey } from "@/shared/lib/pubkey.ts";

import { formatMemberName } from "@/features/channels/lib/memberUtils.ts";
import { resolveUserLabel } from "@/features/profile/lib/identity.ts";

import {
  communityBotNamesByPubkey,
  isUnknownProfileDisplayName,
  overlayCommunityBotDisplayName,
  overlayCommunityBotNamesOnBatch,
  overlayCommunityBotNamesOnProfiles,
  rememberCommunityBotNames,
  resetCommunityBotNameCache,
} from "./displayName.ts";

const MO_PUBKEY = "22".repeat(32);
const ADA_PUBKEY = "aa".repeat(32);

const mo = {
  id: "mo",
  name: "Mo Desk",
  pubkey: MO_PUBKEY,
  source: "openclaw",
};

test("isUnknownProfileDisplayName treats missing and pubkey-like labels as unknown", () => {
  assert.equal(isUnknownProfileDisplayName(null, MO_PUBKEY), true);
  assert.equal(isUnknownProfileDisplayName("   ", MO_PUBKEY), true);
  assert.equal(isUnknownProfileDisplayName(MO_PUBKEY, MO_PUBKEY), true);
  assert.equal(
    isUnknownProfileDisplayName(truncatePubkey(MO_PUBKEY), MO_PUBKEY),
    true,
  );
  assert.equal(isUnknownProfileDisplayName("npub1abc…def", MO_PUBKEY), true);
  assert.equal(isUnknownProfileDisplayName("Unnamed member", MO_PUBKEY), true);
  assert.equal(isUnknownProfileDisplayName("Ada", MO_PUBKEY), false);
});

test("overlayCommunityBotDisplayName prefers the catalog name for unknown kind 0", () => {
  assert.equal(
    overlayCommunityBotDisplayName(null, MO_PUBKEY, [mo]),
    "Mo Desk",
  );
  assert.equal(
    overlayCommunityBotDisplayName(truncatePubkey(MO_PUBKEY), MO_PUBKEY, [mo]),
    "Mo Desk",
  );
  assert.equal(overlayCommunityBotDisplayName("Ada", ADA_PUBKEY, [mo]), "Ada");
  assert.equal(
    overlayCommunityBotDisplayName("Wayfinder", MO_PUBKEY, [mo]),
    "Wayfinder",
  );
});

test("a member pubkey that matches an installed bot shows that bot name", () => {
  const names = communityBotNamesByPubkey([mo]);
  assert.equal(names.get(MO_PUBKEY), "Mo Desk");
  assert.equal(
    resolveUserLabel({
      pubkey: MO_PUBKEY,
      communityBots: [mo],
    }),
    "Mo Desk",
  );
  assert.equal(
    resolveUserLabel({
      pubkey: MO_PUBKEY,
      fallbackName: truncatePubkey(MO_PUBKEY),
      communityBots: [mo],
    }),
    "Mo Desk",
  );
  assert.equal(
    resolveUserLabel({
      pubkey: MO_PUBKEY,
      profiles: {
        [MO_PUBKEY]: {
          displayName: truncatePubkey(MO_PUBKEY),
          avatarUrl: null,
          nip05Handle: null,
          ownerPubkey: null,
        },
      },
      communityBots: [mo],
    }),
    "Mo Desk",
  );
  rememberCommunityBotNames([mo], "");
  try {
    assert.equal(
      formatMemberName({
        pubkey: MO_PUBKEY,
        role: "member",
        isAgent: false,
        joinedAt: "",
        displayName: null,
      }),
      "Mo Desk",
    );
  } finally {
    resetCommunityBotNameCache();
  }
});

test("overlayCommunityBotNamesOnProfiles leaves a real kind 0 name alone", () => {
  const profiles = overlayCommunityBotNamesOnProfiles(
    {
      [MO_PUBKEY]: {
        displayName: "Published Mo",
        avatarUrl: null,
        nip05Handle: null,
        ownerPubkey: null,
      },
    },
    [mo],
  );
  assert.equal(profiles[MO_PUBKEY].displayName, "Published Mo");
});

test("overlayCommunityBotNamesOnBatch seeds missing member profiles from the catalog", () => {
  const batch = overlayCommunityBotNamesOnBatch(
    { profiles: {}, missing: [MO_PUBKEY] },
    [mo],
    [MO_PUBKEY],
  );
  assert.equal(batch.profiles[MO_PUBKEY].displayName, "Mo Desk");
  assert.deepEqual(batch.missing, []);
});
