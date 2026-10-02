import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureNamedChannel,
  exactNamedChannels,
} from "./hulaChannels.ts";

const HOME = "11111111-1111-4111-8111-111111111111";

function channel(name, extras = {}) {
  return {
    id: HOME,
    name,
    channelType: "stream",
    visibility: "open",
    description: "",
    topic: null,
    purpose: null,
    memberCount: 1,
    memberPubkeys: [],
    lastMessageAt: null,
    archivedAt: null,
    participants: [],
    participantPubkeys: [],
    isMember: true,
    ttlSeconds: null,
    ttlDeadline: null,
    ...extras,
  };
}

test("exact channel match ignores archived rows and a different case", () => {
  const channels = [
    channel("claimminer", { archivedAt: "2020-01-01T00:00:00Z" }),
    channel("Claimminer", { id: "22222222-2222-4222-8222-222222222222" }),
    channel("claimminer", { id: "33333333-3333-4333-8333-333333333333" }),
  ];
  assert.deepEqual(
    exactNamedChannels(channels, "claimminer").map((row) => row.id),
    ["33333333-3333-4333-8333-333333333333"],
  );
});

test("one existing channel is joined when the viewer is not a member", async () => {
  const joined = [];
  const resume = new Map();
  const existing = channel("claimminer", { isMember: false });
  const result = await ensureNamedChannel({
    channels: [existing],
    createChannel: async () => {
      throw new Error("create should not run");
    },
    joinChannel: async (id) => {
      joined.push(id);
    },
    name: "claimminer",
    resume,
    resumeKey: "key",
    visibility: "open",
  });
  assert.deepEqual(joined, [HOME]);
  assert.equal(result.isMember, true);
  assert.equal(resume.get("key"), result);
});

test("two channels with the same name stop the create", async () => {
  await assert.rejects(
    () =>
      ensureNamedChannel({
        channels: [
          channel("claimminer"),
          channel("claimminer", {
            id: "22222222-2222-4222-8222-222222222222",
          }),
        ],
        createChannel: async () => {
          throw new Error("create should not run");
        },
        joinChannel: async () => {},
        name: "claimminer",
        resume: new Map(),
        resumeKey: "key",
        visibility: "open",
      }),
    /More than one channel is named "claimminer"/,
  );
});
