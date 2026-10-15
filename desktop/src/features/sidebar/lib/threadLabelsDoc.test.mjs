import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyThreadLabelsDoc,
  mergeThreadLabelsDoc,
  parseThreadLabelsDoc,
  pruneThreadLabelsDoc,
  sameThreadLabelsDoc,
  setThreadLabelEntry,
  threadLabelStoreFromDoc,
  unionLocalThreadLabels,
  THREAD_LABELS_TOMBSTONE_SECONDS,
} from "./threadLabelsDoc.ts";

test("parseThreadLabelsDoc accepts live and tombstone entries", () => {
  const parsed = parseThreadLabelsDoc({
    v: 1,
    labels: {
      rootA: { on: true, at: 10, name: "Launch", icon: "🚀" },
      rootB: { on: false, at: 11 },
      bad: { on: true, at: 1 },
      "": { on: true, at: 1, name: "nope" },
    },
  });
  assert.ok(parsed);
  assert.equal(parsed.labels.rootA.name, "Launch");
  assert.equal(parsed.labels.rootA.icon, "🚀");
  assert.equal(parsed.labels.rootB.on, false);
  assert.equal(parsed.labels.bad, undefined);
  assert.equal(parsed.labels[""], undefined);
});

test("mergeThreadLabelsDoc is last-writer-wins by at", () => {
  const a = emptyThreadLabelsDoc();
  a.labels.root = { on: true, at: 5, name: "Old" };
  const b = emptyThreadLabelsDoc();
  b.labels.root = { on: true, at: 9, name: "New" };
  const merged = mergeThreadLabelsDoc(a, b);
  assert.equal(merged.labels.root.name, "New");
  assert.equal(merged.labels.root.at, 9);
});

test("merge prefers tombstone on equal at", () => {
  const a = emptyThreadLabelsDoc();
  a.labels.root = { on: true, at: 5, name: "Keep" };
  const b = emptyThreadLabelsDoc();
  b.labels.root = { on: false, at: 5 };
  assert.equal(mergeThreadLabelsDoc(a, b).labels.root.on, false);
});

test("setThreadLabelEntry stamps past prior at and clears to tombstone", () => {
  let doc = emptyThreadLabelsDoc();
  doc = setThreadLabelEntry(doc, "root", { name: "Plan" }, 100);
  assert.equal(doc.labels.root.name, "Plan");
  assert.equal(doc.labels.root.at, 100);
  doc = setThreadLabelEntry(doc, "root", { name: "Plan 2" }, 50);
  assert.equal(doc.labels.root.at, 101);
  assert.equal(doc.labels.root.name, "Plan 2");
  doc = setThreadLabelEntry(doc, "root", null, 50);
  assert.equal(doc.labels.root.on, false);
  assert.equal(doc.labels.root.at, 102);
});

test("unionLocalThreadLabels seeds missing roots at at=1", () => {
  const remote = emptyThreadLabelsDoc();
  remote.labels.kept = { on: true, at: 40, name: "Remote" };
  const merged = unionLocalThreadLabels(remote, {
    version: 1,
    labels: {
      kept: { name: "Local older" },
      fresh: { name: "From device", icon: ":ship:" },
    },
  });
  assert.equal(merged.labels.kept.name, "Remote");
  assert.equal(merged.labels.kept.at, 40);
  assert.equal(merged.labels.fresh.name, "From device");
  assert.equal(merged.labels.fresh.at, 1);
  assert.equal(merged.labels.fresh.icon, ":ship:");
});

test("threadLabelStoreFromDoc drops tombstones", () => {
  const doc = emptyThreadLabelsDoc();
  doc.labels.live = { on: true, at: 1, name: "Live" };
  doc.labels.gone = { on: false, at: 2 };
  const store = threadLabelStoreFromDoc(doc);
  assert.deepEqual(store.labels, { live: { name: "Live" } });
});

test("pruneThreadLabelsDoc drops expired tombstones", () => {
  const now = 1_000_000;
  const doc = emptyThreadLabelsDoc();
  doc.labels.fresh = {
    on: false,
    at: now - THREAD_LABELS_TOMBSTONE_SECONDS + 10,
  };
  doc.labels.stale = {
    on: false,
    at: now - THREAD_LABELS_TOMBSTONE_SECONDS - 10,
  };
  doc.labels.live = { on: true, at: 1, name: "Live" };
  const pruned = pruneThreadLabelsDoc(doc, now);
  assert.ok(pruned.labels.fresh);
  assert.equal(pruned.labels.stale, undefined);
  assert.ok(pruned.labels.live);
});

test("sameThreadLabelsDoc ignores key order", () => {
  const a = emptyThreadLabelsDoc();
  a.labels.b = { on: true, at: 1, name: "B" };
  a.labels.a = { on: true, at: 2, name: "A" };
  const b = emptyThreadLabelsDoc();
  b.labels.a = { on: true, at: 2, name: "A" };
  b.labels.b = { on: true, at: 1, name: "B" };
  assert.equal(sameThreadLabelsDoc(a, b), true);
});
