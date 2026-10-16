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

import { listSidebarProjects } from "./listSidebarProjects.ts";
const ME = "a".repeat(64);
const mk = (name, owner, channel) => ({
  name,
  projectAddress: `30621:${owner}:${name}`,
  owner,
  legacy: false,
  ownerPubkey: owner,
  pubkey: owner,
  projectChannelId: channel,
  relatedChannelIds: [],
  repositories: [],
  createdAt: 1,
  isExplicitProject: true,
  kind: "project",
});
test("empty added list falls back to owned + member-channel projects", () => {
  const owned = mk("owned", ME, "c1");
  const joined = mk("joined", "b".repeat(64), "c2");
  const other = mk("other", "b".repeat(64), "c3");
  const out = listSidebarProjects({
    addedProjectAddresses: new Set(),
    currentPubkey: ME,
    filter: "added",
    memberChannelIds: new Set(["c2"]),
    projects: [owned, joined, other],
    sort: "name",
  });
  assert.ok(out.every((p) => p.name !== "other"));
  assert.ok(out.some((p) => p.name === "joined"));
});
