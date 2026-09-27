import assert from "node:assert/strict";
import test from "node:test";

import {
  filterBestieSessionMessages,
  flattenBestieTranscriptMessages,
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
    message({ createdAt: 2, depth: 1, id: "reply", parentId: "root", rootId: "root" }),
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
