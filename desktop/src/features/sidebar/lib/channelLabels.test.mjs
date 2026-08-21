import assert from "node:assert/strict";
import test from "node:test";

import { truncatePubkey } from "@/shared/lib/pubkey.ts";

import { resolveChannelDisplayLabel } from "./channelLabels.ts";

const MO_PUBKEY = "22".repeat(32);
const SELF_PUBKEY = "aa".repeat(32);

const mo = {
  id: "mo",
  name: "Mo Desk",
  pubkey: MO_PUBKEY,
  source: "openclaw",
};

function dmChannel(overrides = {}) {
  return {
    archivedAt: null,
    channelType: "dm",
    id: "dm-mo",
    memberPubkeys: [SELF_PUBKEY, MO_PUBKEY],
    name: "Direct Message",
    participantPubkeys: [SELF_PUBKEY, MO_PUBKEY],
    participants: [null, truncatePubkey(MO_PUBKEY)],
    ...overrides,
  };
}

test("a DM with a community bot shows the catalog name, not a raw pubkey", () => {
  const label = resolveChannelDisplayLabel(
    dmChannel(),
    SELF_PUBKEY,
    undefined,
    [mo],
  );
  assert.equal(label, "Mo Desk");
  assert.equal(label.includes(MO_PUBKEY), false);
  assert.equal(label.includes(truncatePubkey(MO_PUBKEY)), false);
});
