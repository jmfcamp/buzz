import assert from "node:assert/strict";
import test from "node:test";

import { mergeTrees, validTree } from "../../features/sidebar/lib/sidebarLwwMap.ts";
import {
  SURFACE_TABS_LANE,
  projectSurfaceTabs,
  seedSurfaceTabs,
  surfaceTabEdits,
  withStableTabIds,
} from "./surfaceTabSync.ts";

const store = new Map();
globalThis.window ??= {
  localStorage: {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  },
};

const ch = (id, label = id) => ({ id: `channel:${id}`, label, target: { kind: "channel", channelId: id } });
const pin = { id: "pin:p1", label: "Kalshi", target: { kind: "pin", pinId: "p1" } };
const term = { id: "buzz-term", label: "Buzz Term", target: { kind: "buzz-term" } };

test("ids are the surface key on every device", () => {
  const [a] = withStableTabIds([{ id: "random-uuid", label: "x", target: { kind: "channel", channelId: "c" } }]);
  assert.equal(a.id, "channel:c");
});

test("add, reorder and close round-trip; pin and terminal sync as references", () => {
  let tree = surfaceTabEdits({}, [], [ch("a"), pin, term]);
  assert.deepEqual(projectSurfaceTabs(tree).map((t) => t.id), ["channel:a", "pin:p1", "buzz-term"]);
  tree = surfaceTabEdits(tree, projectSurfaceTabs(tree), [term, ch("a"), pin]);
  assert.deepEqual(projectSurfaceTabs(tree).map((t) => t.id), ["buzz-term", "channel:a", "pin:p1"]);
  tree = surfaceTabEdits(tree, projectSurfaceTabs(tree), [term, ch("a")]);
  assert.equal(tree.t["pin:p1"][2], null, "closed tab leaves a tombstone");
  assert.deepEqual(projectSurfaceTabs(tree).map((t) => t.id), ["buzz-term", "channel:a"]);
});

test("no-op edit mints nothing", () => {
  const tree = surfaceTabEdits({}, [], [ch("a")]);
  assert.equal(surfaceTabEdits(tree, [ch("a")], [ch("a")]), tree);
});

test("tombstone beats a stale device's older open; newer reopen wins", () => {
  const base = surfaceTabEdits({}, [], [ch("a"), ch("b")]);
  const stale = base; // device B never saw the close
  const closed = surfaceTabEdits(base, projectSurfaceTabs(base), [ch("a")]);
  const merged = mergeTrees(mergeTrees({}, stale), closed);
  assert.deepEqual(projectSurfaceTabs(merged).map((t) => t.id), ["channel:a"]);
  const reopened = surfaceTabEdits(merged, projectSurfaceTabs(merged), [ch("a"), ch("b")]);
  assert.deepEqual(projectSurfaceTabs(mergeTrees(closed, reopened)).map((t) => t.id), ["channel:a", "channel:b"]);
});

test("per-tab LWW: concurrent rename and add both survive; unordered tabs append", () => {
  const base = surfaceTabEdits({}, [], [ch("a")]);
  const renamed = surfaceTabEdits(base, [ch("a")], [ch("a", "General")]);
  const added = { ...base, t: { ...base.t, "channel:z": [Date.now() + 5, "ffffffffffffffff", { label: "z", target: { kind: "channel", channelId: "z" } }] } };
  const merged = mergeTrees(renamed, added);
  const tabs = projectSurfaceTabs(merged);
  assert.deepEqual(tabs.map((t) => t.id), ["channel:a", "channel:z"]);
  assert.equal(tabs[0].label, "General");
});

test("seed never resurrects a tombstoned tab", () => {
  const closed = surfaceTabEdits(surfaceTabEdits({}, [], [ch("a"), ch("b")]), [ch("a"), ch("b")], [ch("a")]);
  const seeded = seedSurfaceTabs(closed, [ch("b"), ch("c")]);
  assert.deepEqual(projectSurfaceTabs(seeded).map((t) => t.id), ["channel:a", "channel:c"]);
});

test("shape rejects malformed entries but keeps valid siblings", () => {
  const good = surfaceTabEdits({}, [], [ch("a")]);
  const bad = { ...good, t: { ...good.t, "channel:x": [1, "0000000000000000", { label: 3 }] } };
  const valid = validTree(bad, SURFACE_TABS_LANE.shape);
  assert.ok(valid.t["channel:a"]);
  assert.equal(valid.t["channel:x"], undefined);
});
