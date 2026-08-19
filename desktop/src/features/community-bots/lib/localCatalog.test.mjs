import assert from "node:assert/strict";
import test from "node:test";

import {
  communityBotsStorageKey,
  isAlreadyCommunityBotMemberError,
  isAlreadyGoneCommunityBotMemberError,
  isUnknownCommunityBotsKindError,
  mergeCommunityBots,
} from "./localCatalog.ts";

const MO_PUBKEY = "22".repeat(32);
const CAPTAIN_PUBKEY = "33".repeat(32);

const mo = {
  id: "mo",
  name: "Mo",
  pubkey: MO_PUBKEY,
  source: "openclaw",
};

const captain = {
  id: "captain",
  name: "Captain",
  pubkey: CAPTAIN_PUBKEY,
  source: "openclaw",
};

test("communityBotsStorageKey is scoped by normalized relay host", () => {
  const a = communityBotsStorageKey("wss://relay.example.com/");
  const b = communityBotsStorageKey("WSS://relay.example.com");
  const c = communityBotsStorageKey("wss://other.example.com");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^buzz-community-bots\.v1:/);
});

test("mergeCommunityBots keeps local-only ids and prefers 30624 on shared ids", () => {
  const merged = mergeCommunityBots(
    [{ ...mo, name: "Mo from relay" }],
    [mo, captain],
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find((bot) => bot.id === "mo")?.name, "Mo from relay");
  assert.equal(merged.find((bot) => bot.id === "captain")?.id, "captain");
});

test("isUnknownCommunityBotsKindError matches the live publishEvent OK message", () => {
  assert.equal(
    isUnknownCommunityBotsKindError(
      new Error("restricted: unknown event kind"),
    ),
    true,
  );
  assert.equal(
    isUnknownCommunityBotsKindError(new Error("unknown event kind")),
    true,
  );
  assert.equal(
    isUnknownCommunityBotsKindError(new Error("kind not allowed")),
    true,
  );
  assert.equal(
    isUnknownCommunityBotsKindError(
      new Error("Timed out while saving community bots."),
    ),
    false,
  );
});

test("isAlreadyCommunityBotMemberError is conservative", () => {
  assert.equal(
    isAlreadyCommunityBotMemberError(new Error("already a member")),
    true,
  );
  assert.equal(
    isAlreadyCommunityBotMemberError(
      new Error("restricted: unknown event kind"),
    ),
    false,
  );
});

test("isAlreadyGoneCommunityBotMemberError matches official 9031 and gone phrasing", () => {
  assert.equal(
    isAlreadyGoneCommunityBotMemberError(
      new Error(`member not found: ${MO_PUBKEY}`),
    ),
    true,
  );
  assert.equal(
    isAlreadyGoneCommunityBotMemberError(new Error("not a member")),
    true,
  );
  assert.equal(
    isAlreadyGoneCommunityBotMemberError(new Error("unknown member")),
    true,
  );
  assert.equal(
    isAlreadyGoneCommunityBotMemberError(new Error("member missing")),
    true,
  );
  assert.equal(
    isAlreadyGoneCommunityBotMemberError(
      new Error("Timed out while updating relay access."),
    ),
    false,
  );
});
