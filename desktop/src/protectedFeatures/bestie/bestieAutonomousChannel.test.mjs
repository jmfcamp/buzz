import assert from "node:assert/strict";
import test from "node:test";

import {
  BESTIE_AUTONOMOUS_CHANNEL_NAME,
  channelIncludesPubkey,
  findBestieAutonomousChannel,
  isBestieAutonomousChannel,
  isBestieAutonomousChannelName,
  normalizeBestieChannelName,
} from "./bestieAutonomousChannel.ts";
import {
  BESTIE_AUTONOMOUS_CHANNEL_STORAGE_PREFIX,
  bestieAutonomousChannelStorageKey,
  clearBestieAutonomousChannelId,
  parseBestieAutonomousChannelId,
  readBestieAutonomousChannelId,
  writeBestieAutonomousChannelId,
} from "./bestieAutonomousChannelStorage.ts";

const AGENT = "a".repeat(64);
const OWNER = "b".repeat(64);
const SCOPE = {
  agentPubkey: AGENT,
  ownerPubkey: OWNER,
  relayUrl: "wss://relay.example/",
};

function channel(partial) {
  return {
    archivedAt: null,
    channelType: "stream",
    description: "",
    id: "ch-1",
    isMember: true,
    lastMessageAt: null,
    memberCount: 2,
    memberPubkeys: [OWNER, AGENT],
    name: BESTIE_AUTONOMOUS_CHANNEL_NAME,
    participantPubkeys: [],
    participants: [],
    purpose: null,
    topic: null,
    ttlDeadline: null,
    ttlSeconds: null,
    visibility: "private",
    ...partial,
  };
}

test("normalizeBestieChannelName strips hash and case", () => {
  assert.equal(normalizeBestieChannelName("#Bestie-Jobs"), "bestie-jobs");
  assert.equal(isBestieAutonomousChannelName("bestie-jobs"), true);
  assert.equal(isBestieAutonomousChannelName("general"), false);
});

test("findBestieAutonomousChannel prefers stored id when agent is a member", () => {
  const jobs = channel({ id: "jobs-1" });
  const other = channel({
    id: "other",
    name: "general",
    visibility: "open",
  });
  const found = findBestieAutonomousChannel([other, jobs], {
    agentPubkey: AGENT,
    storedChannelId: "jobs-1",
  });
  assert.equal(found?.id, "jobs-1");
});

test("findBestieAutonomousChannel falls back to reserved private stream name", () => {
  const jobs = channel({ id: "jobs-2", name: "#bestie-jobs" });
  const dm = channel({
    id: "dm-1",
    channelType: "dm",
    name: "dm",
    memberPubkeys: [],
    participantPubkeys: [OWNER, AGENT],
    visibility: "private",
  });
  const found = findBestieAutonomousChannel([dm, jobs], {
    agentPubkey: AGENT,
    storedChannelId: null,
  });
  assert.equal(found?.id, "jobs-2");
  assert.equal(isBestieAutonomousChannel(found, AGENT), true);
  assert.equal(isBestieAutonomousChannel(dm, AGENT), false);
});

test("findBestieAutonomousChannel ignores name match without agent membership", () => {
  const jobs = channel({
    id: "jobs-3",
    memberPubkeys: [OWNER],
  });
  assert.equal(
    findBestieAutonomousChannel([jobs], { agentPubkey: AGENT }),
    null,
  );
  assert.equal(channelIncludesPubkey(jobs, AGENT), false);
});

test("autonomous channel storage round-trips scoped id", () => {
  const store = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => store.get(key) ?? null,
      removeItem: (key) => {
        store.delete(key);
      },
      setItem: (key, value) => {
        store.set(key, value);
      },
    },
  };

  const key = bestieAutonomousChannelStorageKey(SCOPE);
  assert.match(key, new RegExp(`^${BESTIE_AUTONOMOUS_CHANNEL_STORAGE_PREFIX}:`));
  assert.equal(parseBestieAutonomousChannelId("  abc  "), "abc");
  assert.equal(parseBestieAutonomousChannelId(""), null);

  writeBestieAutonomousChannelId(SCOPE, "channel-xyz");
  assert.equal(readBestieAutonomousChannelId(SCOPE), "channel-xyz");
  clearBestieAutonomousChannelId(SCOPE);
  assert.equal(readBestieAutonomousChannelId(SCOPE), null);
});

test("design invariant: Bestie DM must not be classified as autonomous", () => {
  const bestieDm = channel({
    id: "bestie-dm",
    channelType: "dm",
    name: "Bestie",
    memberPubkeys: [],
    participantPubkeys: [OWNER, AGENT],
  });
  assert.equal(isBestieAutonomousChannel(bestieDm, AGENT), false);
  assert.equal(
    findBestieAutonomousChannel([bestieDm], {
      agentPubkey: AGENT,
      storedChannelId: "bestie-dm",
    }),
    null,
  );
});
