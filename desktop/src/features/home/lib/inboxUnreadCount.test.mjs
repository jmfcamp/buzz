import assert from "node:assert/strict";
import test from "node:test";

import {
  countUnreadInboxItems,
  projectInboxEffectiveDoneSet,
} from "./inboxUnreadCount.ts";

function item(overrides = {}) {
  return {
    id: overrides.id ?? "a",
    conversationId: overrides.conversationId ?? "c",
    latestActivityAt: overrides.latestActivityAt ?? 100,
    categories: overrides.categories ?? ["mention"],
    item: {
      id: overrides.id ?? "a",
      channelId: overrides.channelId ?? "ch1",
      channelType: overrides.channelType ?? "group",
      createdAt: overrides.latestActivityAt ?? 100,
      kind: 1,
      pubkey: overrides.pubkey ?? "pk",
      tags: overrides.tags ?? [],
      category: overrides.categories?.[0] ?? "mention",
      content: "",
      channelName: null,
    },
    groupItems: [],
    avatarUrl: null,
    categoryLabel: "Mention",
    channelLabel: null,
    fullTimestampLabel: "",
    isActionRequired: false,
    mentionNames: [],
    preview: "",
    senderLabel: "x",
    subject: "",
    timestampLabel: "",
    unreadCount: 1,
  };
}

test("countUnreadInboxItems skips done rows", () => {
  const items = [item({ id: "a" }), item({ id: "b" })];
  assert.equal(countUnreadInboxItems(items, new Set()), 2);
  assert.equal(countUnreadInboxItems(items, new Set(["a"])), 1);
});

test("projectInboxEffectiveDoneSet marks channel rows at-or-below readAt", () => {
  const items = [
    item({ id: "old", latestActivityAt: 50 }),
    item({ id: "new", latestActivityAt: 150 }),
  ];
  const done = projectInboxEffectiveDoneSet(items, {
    getChannelReadAt: () => 100,
    getThreadReadAt: () => null,
    localDoneSet: new Set(),
  });
  assert.equal(done.has("old"), true);
  assert.equal(done.has("new"), false);
});
