import assert from "node:assert/strict";
import test from "node:test";

import { KIND_METADATA } from "@/shared/constants/kinds.ts";

import {
  assertValidBotProfileEvent,
  buildCommunityBotProfileContent,
  communityBotProfileLooksSecret,
} from "./profile.ts";

const BOT_PUBKEY = "22".repeat(32);
const ADMIN_PUBKEY = "aa".repeat(32);

test("buildCommunityBotProfileContent uses the edited display name", () => {
  const content = JSON.parse(buildCommunityBotProfileContent(" Mo Desk "));
  assert.deepEqual(content, { name: "Mo Desk", display_name: "Mo Desk" });
});

test("buildCommunityBotProfileContent rejects secrets and empty names", () => {
  assert.throws(() => buildCommunityBotProfileContent("   "), /required/);
  assert.throws(
    () => buildCommunityBotProfileContent("nsec1notasecret"),
    /secrets/,
  );
  assert.equal(communityBotProfileLooksSecret('{"nsec":"secret"}'), true);
});

test("assertValidBotProfileEvent requires kind 0 signed as the bot", () => {
  const content = buildCommunityBotProfileContent("Wayfinder");
  assert.doesNotThrow(() =>
    assertValidBotProfileEvent(
      {
        id: "evt",
        pubkey: BOT_PUBKEY,
        kind: KIND_METADATA,
        created_at: 1,
        content,
        tags: [],
        sig: "00",
      },
      BOT_PUBKEY,
      "Wayfinder",
    ),
  );
  assert.throws(
    () =>
      assertValidBotProfileEvent(
        {
          id: "evt",
          pubkey: ADMIN_PUBKEY,
          kind: KIND_METADATA,
          created_at: 1,
          content,
          tags: [],
          sig: "00",
        },
        BOT_PUBKEY,
        "Wayfinder",
      ),
    /signed as the bot/,
  );
  assert.throws(
    () =>
      assertValidBotProfileEvent(
        {
          id: "evt",
          pubkey: BOT_PUBKEY,
          kind: 1,
          created_at: 1,
          content,
          tags: [],
          sig: "00",
        },
        BOT_PUBKEY,
        "Wayfinder",
      ),
    /kind 0/,
  );
});
