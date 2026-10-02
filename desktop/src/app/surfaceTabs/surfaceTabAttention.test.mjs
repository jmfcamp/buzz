import assert from "node:assert/strict";
import { test } from "node:test";

import {
  surfaceTabAccessibleName,
  surfaceTabMark,
} from "./surfaceTabAttention.ts";

const QUIET_PREFS = {
  inbox: false,
  agents: false,
  bots: false,
  browsers: false,
};

function mark(overrides) {
  return surfaceTabMark({
    menuCounts: { inbox: 0, agents: "0/0", bots: 0, browsers: 0 },
    menuPreferences: QUIET_PREFS,
    unreadChannelIds: new Set(),
    unreadChannelCounts: new Map(),
    dmChannelIds: new Set(),
    unreadThreadChannelIds: new Set(),
    unreadThreadFeedItems: [],
    hasSidebarUnreadProjections: true,
    ...overrides,
  });
}

test("primary tabs copy the left-panel count chip", () => {
  assert.deepEqual(
    mark({
      target: { kind: "home" },
      menuCounts: { inbox: 4, agents: "0/0", bots: 0, browsers: 0 },
    }),
    { bold: false, countLabel: "4" },
  );
  assert.deepEqual(
    mark({
      target: { kind: "home" },
      menuCounts: { inbox: 0, agents: "0/0", bots: 0, browsers: 0 },
      menuPreferences: { ...QUIET_PREFS, inbox: true },
    }),
    { bold: false, countLabel: "0" },
  );
  assert.deepEqual(mark({ target: { kind: "home" } }), {
    bold: false,
    countLabel: null,
  });
  assert.deepEqual(
    mark({
      target: { kind: "agents" },
      menuCounts: { inbox: 0, agents: "2/9", bots: 0, browsers: 0 },
      menuPreferences: { ...QUIET_PREFS, agents: true },
    }),
    { bold: false, countLabel: "2/9" },
  );
  assert.equal(
    mark({
      target: { kind: "agents" },
      menuCounts: { inbox: 0, agents: "2/9", bots: 0, browsers: 0 },
    }).countLabel,
    null,
  );
  assert.equal(
    mark({
      target: { kind: "bots" },
      menuCounts: { inbox: 0, agents: "0/0", bots: 8, browsers: 0 },
    }).countLabel,
    null,
  );
  assert.deepEqual(
    mark({
      target: { kind: "browsers" },
      menuCounts: { inbox: 0, agents: "0/0", bots: 0, browsers: 1 },
    }),
    { bold: false, countLabel: "1" },
  );
  for (const kind of [
    "pulse",
    "projects",
    "workflows",
    "buzz-term",
    "assistant",
  ]) {
    assert.deepEqual(mark({ target: { kind } }), {
      bold: false,
      countLabel: null,
    });
  }
});

test("channel and thread tabs copy bold unread and the count", () => {
  const threadItem = {
    id: "m1",
    channelId: "c1",
    tags: [
      ["e", "root-1", "", "root"],
      ["e", "parent-1", "", "reply"],
    ],
  };
  assert.deepEqual(
    mark({
      target: { kind: "channel", channelId: "c1" },
      unreadChannelIds: new Set(["c1"]),
      unreadChannelCounts: new Map([["c1", 4]]),
      unreadThreadFeedItems: [threadItem],
    }),
    { bold: true, countLabel: "4" },
  );
  assert.deepEqual(
    mark({
      target: { kind: "channel", channelId: "c2" },
      unreadThreadChannelIds: new Set(["c2"]),
    }),
    { bold: true, countLabel: "1" },
  );
  assert.deepEqual(
    mark({
      target: { kind: "channel", channelId: "dm1" },
      unreadChannelIds: new Set(["dm1"]),
      unreadChannelCounts: new Map([["dm1", 2]]),
      dmChannelIds: new Set(["dm1"]),
    }),
    { bold: true, countLabel: null },
  );
  assert.deepEqual(
    mark({
      target: { kind: "thread", channelId: "c1", rootId: "root-1" },
      unreadThreadFeedItems: [threadItem],
    }),
    { bold: true, countLabel: "1" },
  );
  assert.deepEqual(
    mark({
      target: { kind: "channel", channelId: "c1" },
      unreadChannelIds: new Set(["c1"]),
      unreadChannelCounts: new Map([["c1", 120]]),
    }),
    { bold: true, countLabel: "99+" },
  );
  assert.equal(
    surfaceTabAccessibleName("General", { bold: true, countLabel: "4" }),
    "General, 4 unread",
  );
  assert.equal(
    surfaceTabAccessibleName("Ada", { bold: true, countLabel: null }),
    "Ada, unread",
  );
  assert.equal(
    surfaceTabAccessibleName("Agents", { bold: false, countLabel: "2/9" }),
    "Agents, 2/9",
  );
  assert.equal(
    surfaceTabAccessibleName(
      "General",
      { bold: true, countLabel: "4" },
      "Ada working",
    ),
    "General, Ada working, 4 unread",
  );
  assert.equal(
    surfaceTabAccessibleName("Inbox", { bold: false, countLabel: null }, "  "),
    "Inbox",
  );
});
