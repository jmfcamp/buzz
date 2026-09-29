import assert from "node:assert/strict";
import test from "node:test";

import {
  isArchivedHuddleSidebarChannel,
  isHuddleBackingChannel,
  looksLikeHuddleBackingChannel,
  shouldShowSidebarChannel,
  sortArchivedHuddleChannels,
} from "./huddleChannelVisibility.ts";

function channel(overrides = {}) {
  return {
    id: "channel-id",
    name: "general",
    channelType: "stream",
    ttlSeconds: null,
    lastMessageAt: null,
    ...overrides,
  };
}

test("ordinary channels stay visible without an explicit reveal", () => {
  assert.equal(shouldShowSidebarChannel(channel(), new Set(), new Set()), true);
});

test("tracked huddle backing channels stay hidden from primary by default", () => {
  const huddle = channel({
    id: "stale-huddle",
    name: "general huddle",
    ttlSeconds: 3_600,
  });
  const huddleBackingChannelIds = new Set([huddle.id]);

  assert.equal(isHuddleBackingChannel(huddle, huddleBackingChannelIds), true);
  assert.equal(
    shouldShowSidebarChannel(huddle, huddleBackingChannelIds, new Set()),
    false,
  );
});

test("an explicitly revealed huddle channel appears in the primary sidebar", () => {
  const huddle = channel({
    id: "active-huddle",
    name: "huddle",
    ttlSeconds: 3_600,
  });

  assert.equal(
    shouldShowSidebarChannel(
      huddle,
      new Set([huddle.id]),
      new Set([huddle.id]),
    ),
    true,
  );
});

test("permanent channels with huddle-shaped names remain ordinary", () => {
  const ordinaryChannel = channel({
    name: "design huddle",
    ttlSeconds: null,
  });

  assert.equal(looksLikeHuddleBackingChannel(ordinaryChannel), false);
  assert.equal(isHuddleBackingChannel(ordinaryChannel, new Set()), false);
  assert.equal(
    shouldShowSidebarChannel(ordinaryChannel, new Set(), new Set()),
    true,
  );
});

test("ephemeral huddle-named leftovers count as backing without local tracking", () => {
  const leftover = channel({
    id: "leftover",
    name: "integration-services huddle",
    ttlSeconds: 3_600,
  });

  assert.equal(looksLikeHuddleBackingChannel(leftover), true);
  assert.equal(isHuddleBackingChannel(leftover, new Set()), true);
  assert.equal(shouldShowSidebarChannel(leftover, new Set(), new Set()), false);
  assert.equal(
    isArchivedHuddleSidebarChannel(leftover, new Set(), new Set(), null),
    true,
  );
});

test("fallback huddle-<hex> ephemeral names count as backing channels", () => {
  const fallback = channel({
    id: "fallback",
    name: "huddle-a1b2c3d4",
    ttlSeconds: 3_600,
  });
  assert.equal(looksLikeHuddleBackingChannel(fallback), true);
});

test("live active huddles stay out of Archived Huddles", () => {
  const live = channel({
    id: "live-huddle",
    name: "ops huddle",
    ttlSeconds: 3_600,
  });
  assert.equal(
    isArchivedHuddleSidebarChannel(
      live,
      new Set([live.id]),
      new Set(),
      live.id,
    ),
    false,
  );
});

test("ended tracked huddles land in Archived Huddles", () => {
  const ended = channel({
    id: "ended-huddle",
    name: "ops huddle",
    ttlSeconds: 3_600,
  });
  assert.equal(
    isArchivedHuddleSidebarChannel(
      ended,
      new Set([ended.id]),
      new Set(),
      null,
    ),
    true,
  );
});

test("sortArchivedHuddleChannels prefers recent activity", () => {
  const older = channel({
    id: "a",
    name: "alpha huddle",
    ttlSeconds: 3_600,
    lastMessageAt: "2026-01-01T00:00:00.000Z",
  });
  const newer = channel({
    id: "b",
    name: "beta huddle",
    ttlSeconds: 3_600,
    lastMessageAt: "2026-06-01T00:00:00.000Z",
  });
  assert.deepEqual(
    sortArchivedHuddleChannels([older, newer]).map((item) => item.id),
    ["b", "a"],
  );
});
