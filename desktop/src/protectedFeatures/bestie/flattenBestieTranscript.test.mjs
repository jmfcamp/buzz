import assert from "node:assert/strict";
import test from "node:test";

import {
  collectBestieSessionThreadRootIds,
  filterBestieSessionMessages,
  filterMessagesInBestieThread,
  flattenBestieTranscriptMessages,
  resolveBestieComposerThread,
  resolveBestieSendParentEventId,
} from "./flattenBestieTranscript.ts";

function message(partial) {
  return {
    author: partial.author ?? "user",
    body: partial.body ?? "hi",
    createdAt: partial.createdAt ?? 1,
    depth: partial.depth ?? 0,
    id: partial.id,
    parentId: partial.parentId ?? null,
    rootId: partial.rootId ?? null,
    time: "12:00",
  };
}

test("flattenBestieTranscriptMessages clears reply links and sorts", () => {
  const flattened = flattenBestieTranscriptMessages([
    message({
      createdAt: 2,
      depth: 1,
      id: "reply",
      parentId: "root",
      rootId: "root",
    }),
    message({ createdAt: 1, id: "root" }),
  ]);
  assert.deepEqual(
    flattened.map((entry) => ({
      depth: entry.depth,
      id: entry.id,
      parentId: entry.parentId,
      rootId: entry.rootId,
    })),
    [
      { depth: 0, id: "root", parentId: null, rootId: null },
      { depth: 0, id: "reply", parentId: null, rootId: null },
    ],
  );
});

test("filterBestieSessionMessages keeps in-session roots and replies", () => {
  const filtered = filterBestieSessionMessages(
    [
      message({ createdAt: 1, id: "old" }),
      message({ createdAt: 10, id: "root" }),
      message({
        createdAt: 11,
        depth: 1,
        id: "reply",
        parentId: "root",
        rootId: "root",
      }),
      message({ createdAt: 12, id: "outside-later" }),
    ],
    {
      baselineMessageIds: new Set(["old"]),
      firstMessageCreatedAt: 10,
    },
  );
  assert.deepEqual(
    filtered.map((entry) => entry.id),
    ["root", "reply", "outside-later"],
  );
});

test("filterBestieSessionMessages returns empty without a boundary", () => {
  assert.deepEqual(
    filterBestieSessionMessages([message({ id: "a" })], null),
    [],
  );
});

test("filterBestieSessionMessages returns the full in-session list", () => {
  const many = Array.from({ length: 30 }, (_, index) =>
    message({ createdAt: 100 + index, id: `m${index}` }),
  );
  const filtered = filterBestieSessionMessages(many, {
    baselineMessageIds: new Set(),
    firstMessageCreatedAt: 100,
  });
  assert.equal(filtered.length, 30);
  assert.equal(filtered[0].id, "m0");
  assert.equal(filtered.at(-1).id, "m29");
});

test("resolveBestieSendParentEventId is null for a new session", () => {
  assert.equal(resolveBestieSendParentEventId(null), null);
  assert.equal(resolveBestieSendParentEventId(undefined), null);
});

test("second send continues the same session thread root", () => {
  assert.equal(
    resolveBestieSendParentEventId({ sessionRootId: "session-root-1" }),
    "session-root-1",
  );
});

test("a message ask starts its own thread and ignores the bottom session", () => {
  assert.deepEqual(
    resolveBestieComposerThread({
      footerSessionRootId: "footer-root",
      isMessageAsk: true,
      messageThreadRootId: null,
    }),
    { create: "message", parentEventId: null },
  );
});

test("reopening the same message continues that message thread", () => {
  assert.deepEqual(
    resolveBestieComposerThread({
      footerSessionRootId: "footer-root",
      isMessageAsk: true,
      messageThreadRootId: "message-root",
    }),
    { create: "none", parentEventId: "message-root" },
  );
});

test("the bottom assistant continues its own session", () => {
  assert.deepEqual(
    resolveBestieComposerThread({
      footerSessionRootId: "footer-root",
      isMessageAsk: false,
      messageThreadRootId: "message-root",
    }),
    { create: "none", parentEventId: "footer-root" },
  );
  assert.deepEqual(
    resolveBestieComposerThread({
      footerSessionRootId: null,
      isMessageAsk: false,
    }),
    { create: "footer", parentEventId: null },
  );
});

test("a message thread shows only that root and its replies", () => {
  const visible = filterMessagesInBestieThread(
    [
      message({ createdAt: 1, id: "footer-root" }),
      message({
        createdAt: 2,
        id: "footer-reply",
        parentId: "footer-root",
        rootId: "footer-root",
      }),
      message({ createdAt: 3, id: "ask-root" }),
      message({
        createdAt: 4,
        id: "ask-reply",
        parentId: "ask-root",
        rootId: "ask-root",
      }),
      message({ createdAt: 5, id: "other-ask" }),
    ],
    "ask-root",
  );
  assert.deepEqual(
    visible.map((entry) => entry.id),
    ["ask-root", "ask-reply"],
  );
});

test("the bottom transcript hides message-ask threads", () => {
  const filtered = filterBestieSessionMessages(
    [
      message({ createdAt: 10, id: "footer-root" }),
      message({
        createdAt: 11,
        id: "footer-reply",
        parentId: "footer-root",
        rootId: "footer-root",
      }),
      message({ createdAt: 12, id: "ask-root" }),
      message({
        createdAt: 13,
        id: "ask-reply",
        parentId: "ask-root",
        rootId: "ask-root",
      }),
    ],
    {
      baselineMessageIds: new Set(),
      firstMessageCreatedAt: 10,
      sessionRootId: "footer-root",
    },
    { excludeRootIds: new Set(["ask-root"]) },
  );
  assert.deepEqual(
    filtered.map((entry) => entry.id),
    ["footer-root", "footer-reply"],
  );
  const roots = collectBestieSessionThreadRootIds(
    {
      baselineMessageIds: new Set(),
      firstMessageCreatedAt: 10,
      sessionRootId: "footer-root",
    },
    [
      { createdAt: 10, id: "footer-root", parentId: null },
      { createdAt: 12, id: "ask-root", parentId: null },
    ],
    new Set(["ask-root"]),
  );
  assert.deepEqual(roots, ["footer-root"]);
});

test("collectBestieSessionThreadRootIds includes session root and legacy roots", () => {
  const ids = collectBestieSessionThreadRootIds(
    {
      baselineMessageIds: new Set(["old"]),
      firstMessageCreatedAt: 10,
      sessionRootId: "session-root",
    },
    [
      { createdAt: 1, id: "old", parentId: null },
      { createdAt: 10, id: "session-root", parentId: null },
      { createdAt: 12, id: "legacy-root", parentId: null },
      { createdAt: 13, id: "reply", parentId: "session-root" },
    ],
  );
  assert.deepEqual(ids.sort(), ["legacy-root", "session-root"]);
});

test("popover open with existing session shows messages without compose", () => {
  // Mirrors reopen hydrate: stored boundary + channel roots + thread replies
  // already yield a non-empty transcript (no draft/compose trigger required).
  const boundary = {
    baselineMessageIds: new Set(["pre-session"]),
    firstMessageCreatedAt: 100,
    sessionRootId: "root-1",
  };
  const hydrated = filterBestieSessionMessages(
    [
      message({ createdAt: 50, id: "pre-session" }),
      message({ createdAt: 100, id: "root-1" }),
      message({
        createdAt: 101,
        depth: 1,
        id: "agent-1",
        parentId: "root-1",
        rootId: "root-1",
      }),
      message({
        createdAt: 102,
        depth: 1,
        id: "user-2",
        parentId: "root-1",
        rootId: "root-1",
      }),
    ],
    boundary,
  );
  const flattened = flattenBestieTranscriptMessages(hydrated);
  assert.deepEqual(
    flattened.map((entry) => entry.id),
    ["root-1", "agent-1", "user-2"],
  );
  assert.ok(flattened.length > 0, "transcript must be non-empty on open");
});
