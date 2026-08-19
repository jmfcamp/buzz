import assert from "node:assert/strict";
import test from "node:test";

import { KIND_COMMUNITY_BOTS } from "@/shared/constants/kinds.ts";

import {
  otherBotsSharePubkey,
  parseCommunityBotsPayload,
  removeInstalledBot,
  selectLatestCommunityBots,
  upsertInstalledBot,
} from "./catalog.ts";

const MO_PUBKEY = "22".repeat(32);

test("parseCommunityBotsPayload keeps valid openclaw bots", () => {
  const bots = parseCommunityBotsPayload(
    JSON.stringify({
      version: 1,
      bots: [
        { id: "mo", name: "Mo", pubkey: MO_PUBKEY, source: "openclaw" },
        { id: "bad", name: "Bad", pubkey: "not-a-key", source: "openclaw" },
        {
          id: "other",
          name: "Other",
          pubkey: "aa".repeat(32),
          source: "local",
        },
      ],
    }),
  );
  assert.equal(bots.length, 1);
  assert.equal(bots[0].id, "mo");
  assert.equal(bots[0].pubkey, MO_PUBKEY);
});

test("selectLatestCommunityBots uses the newest created_at", () => {
  const bots = selectLatestCommunityBots([
    {
      id: "older",
      kind: KIND_COMMUNITY_BOTS,
      created_at: 10,
      content: JSON.stringify({
        version: 1,
        bots: [
          {
            id: "old",
            name: "Old",
            pubkey: "aa".repeat(32),
            source: "openclaw",
          },
        ],
      }),
    },
    {
      id: "newer",
      kind: KIND_COMMUNITY_BOTS,
      created_at: 20,
      content: JSON.stringify({
        version: 1,
        bots: [
          {
            id: "main",
            name: "Main",
            pubkey: "bb".repeat(32),
            source: "openclaw",
          },
        ],
      }),
    },
  ]);
  assert.equal(bots.length, 1);
  assert.equal(bots[0].id, "main");
});

test("upsert and uninstall keep a shared pubkey installed", () => {
  const shared = "cc".repeat(32);
  const first = upsertInstalledBot([], {
    id: "mo",
    name: "Mo",
    pubkey: shared,
    source: "openclaw",
  });
  const both = upsertInstalledBot(first, {
    id: "captain",
    name: "Captain",
    pubkey: shared,
    source: "openclaw",
  });
  assert.equal(otherBotsSharePubkey(both, "mo", shared), true);
  const remaining = removeInstalledBot(both, "mo");
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "captain");
});
