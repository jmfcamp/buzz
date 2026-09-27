import assert from "node:assert/strict";
import test from "node:test";

import { filterBestieActivityItems } from "./filterBestieActivityItems.ts";

function tool(id, channelId = "dm-1") {
  return {
    id,
    type: "tool",
    renderClass: "file-read",
    descriptor: { renderClass: "file-read", label: "Read", preview: null },
    title: "Read",
    toolName: "Read",
    buzzToolName: null,
    status: "completed",
    args: {},
    result: "",
    isError: false,
    timestamp: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    channelId,
  };
}

test("filterBestieActivityItems keeps tools, drops messages and other channels", () => {
  const items = [
    tool("t1", "dm-1"),
    {
      id: "m1",
      type: "message",
      renderClass: "message",
      role: "assistant",
      title: "Assistant",
      text: "hi",
      timestamp: "2026-01-01T00:00:00.000Z",
      channelId: "dm-1",
    },
    tool("t2", "other"),
    {
      id: "raw",
      type: "metadata",
      renderClass: "raw-rail",
      title: "Raw",
      sections: [],
      timestamp: "2026-01-01T00:00:00.000Z",
      channelId: "dm-1",
    },
  ];
  const filtered = filterBestieActivityItems(items, { channelId: "dm-1" });
  assert.deepEqual(
    filtered.map((item) => item.id),
    ["t1"],
  );
});
