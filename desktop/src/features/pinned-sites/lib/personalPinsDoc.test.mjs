import assert from "node:assert/strict";
import test from "node:test";

import {
  applyLocalPins,
  emptyPinsDoc,
  mergePinsDocs,
  parsePinsDoc,
  pinsFromDoc,
  prunePinsDoc,
  samePinsDoc,
  unionLocalPins,
} from "./personalPinsDoc.ts";

const pin = (id, name = id) => ({
  id,
  name,
  url: `https://${id}.example`,
  icon: "globe",
  pollForChanges: false,
  openMatchingLinks: true,
  scope: "personal",
});

test("order is preserved and synced", () => {
  const d = applyLocalPins(emptyPinsDoc(), [pin("b"), pin("a"), pin("c")], 100);
  assert.deepEqual(
    pinsFromDoc(d).map((p) => p.id),
    ["b", "a", "c"],
  );
  const moved = applyLocalPins(d, [pin("a"), pin("b"), pin("c")], 200);
  assert.deepEqual(
    pinsFromDoc(mergePinsDocs(d, moved)).map((p) => p.id),
    ["a", "b", "c"],
  );
});

test("delete on one device beats a stale copy; newer re-add wins back", () => {
  const d = applyLocalPins(emptyPinsDoc(), [pin("a"), pin("b")], 100);
  const del = applyLocalPins(d, [pin("b")], 200);
  assert.deepEqual(
    pinsFromDoc(mergePinsDocs(d, del)).map((p) => p.id),
    ["b"],
  );
  const readd = applyLocalPins(del, [pin("b"), pin("a", "A2")], 300);
  const m = mergePinsDocs(del, readd);
  assert.equal(pinsFromDoc(m).find((p) => p.id === "a").name, "A2");
  assert.ok(
    samePinsDoc(mergePinsDocs(m, del), mergePinsDocs(del, m)),
    "commutative",
  );
});

test("first-run union keeps both devices' pins and never resurrects remote deletes", () => {
  let remote = applyLocalPins(emptyPinsDoc(), [pin("x"), pin("gone")], 100);
  remote = applyLocalPins(remote, [pin("x")], 150);
  const merged = unionLocalPins(remote, [pin("gone"), pin("mine")]);
  assert.deepEqual(
    pinsFromDoc(merged).map((p) => p.id),
    ["x", "mine"],
  );
});

test("tombstones expire; parse round-trips and drops junk", () => {
  const d = applyLocalPins(
    applyLocalPins(emptyPinsDoc(), [pin("a")], 1),
    [],
    2,
  );
  assert.equal(Object.keys(prunePinsDoc(d, 10 ** 9).pins).length, 0);
  const live = applyLocalPins(emptyPinsDoc(), [pin("a")], 5);
  assert.ok(samePinsDoc(parsePinsDoc(JSON.parse(JSON.stringify(live))), live));
  assert.equal(parsePinsDoc({ v: 2 }), null);
  assert.deepEqual(
    Object.keys(parsePinsDoc({ v: 1, pins: { z: { on: true, at: 1 } } }).pins),
    [],
  );
});
