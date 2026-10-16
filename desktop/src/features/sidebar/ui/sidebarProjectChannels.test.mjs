import assert from "node:assert/strict";
import test from "node:test";
import { excludeProjectChannelsFromUngrouped } from "./listSidebarProjects.ts";

test("drops only project channels from the ungrouped list", () => {
  const out = excludeProjectChannelsFromUngrouped(
    [{ id: "general" }, { id: "proj-home" }, { id: "proj-sub" }],
    new Set(["proj-home", "proj-sub"]),
  );
  assert.deepEqual(
    out.map((c) => c.id),
    ["general"],
  );
});
test("no projects -> unchanged", () => {
  assert.deepEqual(
    excludeProjectChannelsFromUngrouped([{ id: "a" }], new Set()),
    [{ id: "a" }],
  );
});
