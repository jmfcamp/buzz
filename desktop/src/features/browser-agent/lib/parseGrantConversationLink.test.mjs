import assert from "node:assert/strict";
import test from "node:test";

import { parseGrantConversationLink } from "./parseGrantConversationLink.ts";

test("parseGrantConversationLink reads buzz channel and message links", () => {
  assert.deepEqual(
    parseGrantConversationLink(
      "buzz://channel/11111111-1111-4111-8111-111111111111",
    ),
    {
      channelId: "11111111-1111-4111-8111-111111111111",
      threadRoot: null,
    },
  );

  const eventId = "a".repeat(64);
  assert.deepEqual(
    parseGrantConversationLink(
      `buzz://message?channel=11111111-1111-4111-8111-111111111111&id=${eventId}&thread=${eventId}`,
    ),
    {
      channelId: "11111111-1111-4111-8111-111111111111",
      threadRoot: eventId,
    },
  );
});

test("parseGrantConversationLink reads /channels paths", () => {
  const eventId = "b".repeat(64);
  assert.deepEqual(
    parseGrantConversationLink(
      `/channels/11111111-1111-4111-8111-111111111111/posts/${eventId}`,
    ),
    {
      channelId: "11111111-1111-4111-8111-111111111111",
      threadRoot: eventId,
    },
  );
  assert.deepEqual(
    parseGrantConversationLink(
      "/channels/11111111-1111-4111-8111-111111111111?threadRootId=root-1",
    ),
    {
      channelId: "11111111-1111-4111-8111-111111111111",
      threadRoot: "root-1",
    },
  );
});

test("parseGrantConversationLink accepts hulabuzz://message without thread=", () => {
  const eventId = "c".repeat(64);
  assert.deepEqual(
    parseGrantConversationLink(
      `hulabuzz://message?channel=2c0754d0-7fe2-45d6-817c-f3b9407286d5&id=${eventId}`,
    ),
    {
      channelId: "2c0754d0-7fe2-45d6-817c-f3b9407286d5",
      // Message deep links bind channel only unless thread= is present.
      threadRoot: null,
    },
  );
});

test("parseGrantConversationLink accepts hulabuzz://message with thread=", () => {
  const eventId = "d".repeat(64);
  const threadId = "e".repeat(64);
  assert.deepEqual(
    parseGrantConversationLink(
      `hulabuzz://message?channel=2c0754d0-7fe2-45d6-817c-f3b9407286d5&id=${eventId}&thread=${threadId}`,
    ),
    {
      channelId: "2c0754d0-7fe2-45d6-817c-f3b9407286d5",
      threadRoot: threadId,
    },
  );
});

test("parseGrantConversationLink accepts hulabuzz://channel links", () => {
  assert.deepEqual(
    parseGrantConversationLink(
      "hulabuzz://channel/2c0754d0-7fe2-45d6-817c-f3b9407286d5",
    ),
    {
      channelId: "2c0754d0-7fe2-45d6-817c-f3b9407286d5",
      threadRoot: null,
    },
  );
});
