import assert from "node:assert/strict";
import test from "node:test";

import {
  browserBindingChannelLabel,
  browserBindingChipLabel,
  browserBindingChipTooltip,
  browserBindingSourceLabel,
  browserBindingThreadLabel,
  buildBrowserConversationBindings,
} from "./browserBindings.ts";

test("buildBrowserConversationBindings collapses same channel+thread to grant", () => {
  const bindings = buildBrowserConversationBindings({
    grant: {
      webviewLabel: "playground-abc",
      surface: "playground",
      surfaceId: "abc",
      agentId: "a",
      agentPubkey: "pk",
      channelId: "channel-1",
      threadRoot: "thread-1",
      mode: "observe",
      createdAtMs: 1,
    },
    pinBindings: [
      {
        scopeKey: "thread:thread-1",
        channelId: "channel-1",
        threadRoot: "thread-1",
      },
    ],
  });
  assert.equal(bindings.length, 1);
  assert.equal(bindings[0].source, "grant");
  assert.equal(bindings[0].mode, "observe");
});

test("buildBrowserConversationBindings keeps distinct pin targets", () => {
  const bindings = buildBrowserConversationBindings({
    grant: {
      webviewLabel: "playground-abc",
      surface: "playground",
      surfaceId: "abc",
      agentId: "a",
      agentPubkey: "pk",
      channelId: "channel-1",
      threadRoot: null,
      mode: "drive",
      createdAtMs: 1,
    },
    pinBindings: [
      {
        scopeKey: "channel:channel-2",
        channelId: "channel-2",
        threadRoot: null,
      },
    ],
  });
  assert.equal(bindings.length, 2);
  assert.equal(bindings[0].source, "grant");
  assert.equal(bindings[1].source, "pin");
});

test("buildBrowserConversationBindings skips pin without channelId", () => {
  const bindings = buildBrowserConversationBindings({
    grant: null,
    pinBindings: [{ scopeKey: "thread:t1", channelId: null, threadRoot: "t1" }],
  });
  assert.equal(bindings.length, 0);
});

test("browserBinding labels prefer short display names", () => {
  assert.equal(browserBindingChannelLabel("channel-1", "General"), "General");
  assert.equal(browserBindingChannelLabel("abcdefghijklmnop"), "abcdefghij…");
  assert.equal(browserBindingThreadLabel(), "Thread");
  assert.equal(
    browserBindingSourceLabel({ source: "grant", mode: "observe" }),
    "Observing",
  );
  assert.equal(
    browserBindingSourceLabel({ source: "grant", mode: "drive" }),
    "Driving",
  );
  assert.equal(browserBindingSourceLabel({ source: "pin" }), "Pinned");
});

test("browserBindingChipLabel is one chip for channel or thread", () => {
  assert.equal(
    browserBindingChipLabel("channel-1", "General", null),
    "General",
  );
  assert.equal(
    browserBindingChipLabel("channel-1", "General", "thread-root-1"),
    "General: Thread",
  );
  assert.equal(
    browserBindingChipTooltip("channel-1", "General", "thread-root-1"),
    "General · thread thread-root-1",
  );
  assert.equal(
    browserBindingChipTooltip("channel-1", null, null),
    "channel-1",
  );
});
