import assert from "node:assert/strict";
import test from "node:test";

import { PROJECT_CHANNEL_SECTIONS } from "./ProjectWorkspaceTabList.tsx";

test("channel sections put Chat first and Read Me in place of Overview", () => {
  assert.deepEqual(
    PROJECT_CHANNEL_SECTIONS.map((section) => section.label),
    [
      "Chat",
      "Read Me",
      "Files",
      "Commits",
      "Tasks",
      "Channels",
      "Contributors",
    ],
  );
  assert.equal(
    PROJECT_CHANNEL_SECTIONS.some((section) => section.label === "Overview"),
    false,
  );
  assert.deepEqual(
    PROJECT_CHANNEL_SECTIONS.map((section) => section.value),
    [
      "chat",
      "overview",
      "files",
      "activity",
      "issues",
      "channels",
      "contributors",
    ],
  );
});
