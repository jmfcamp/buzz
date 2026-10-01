import assert from "node:assert/strict";
import test from "node:test";

import {
  boundThreadLabelStore,
  normalizeThreadLabelIcon,
  normalizeThreadLabelName,
  MAX_THREAD_LABELS,
  parseThreadLabelPayload,
  readThreadLabelsStore,
  starredThreadTitle,
  threadHeaderTitle,
  THREAD_LABEL_ICON_MAX,
  THREAD_LABEL_NAME_MAX,
  writeThreadLabelsStore,
} from "./threadLabels.ts";
import { __resetThreadLabelsCacheForTests } from "./useThreadLabels.ts";

const memory = new Map();

test("threadHeaderTitle uses the saved name and otherwise Thread", () => {
  assert.equal(threadHeaderTitle(undefined), "Thread");
  assert.equal(threadHeaderTitle("  "), "Thread");
  assert.equal(threadHeaderTitle("Launch plan"), "Launch plan");
});

test("starredThreadTitle prefers the saved name over the excerpt", () => {
  assert.equal(starredThreadTitle("excerpt", "Launch plan"), "Launch plan");
  assert.equal(starredThreadTitle("excerpt", "  "), "excerpt");
  assert.equal(starredThreadTitle("  ", undefined), "Thread");
});

test("normalizeThreadLabelName caps length and collapses space", () => {
  assert.equal(normalizeThreadLabelName("  a   b  "), "a b");
  assert.equal(
    normalizeThreadLabelName("x".repeat(THREAD_LABEL_NAME_MAX + 10)).length,
    THREAD_LABEL_NAME_MAX,
  );
});

test("normalizeThreadLabelIcon drops blank values and caps length", () => {
  assert.equal(normalizeThreadLabelIcon("  "), "");
  assert.equal(normalizeThreadLabelIcon(" :ship: "), ":ship:");
  assert.equal(normalizeThreadLabelIcon("🚀"), "🚀");
  const capped = normalizeThreadLabelIcon("x".repeat(THREAD_LABEL_ICON_MAX + 16));
  assert.equal(capped.length, THREAD_LABEL_ICON_MAX);
  const parsed = parseThreadLabelPayload({
    version: 1,
    labels: { root: { name: "Plan", icon: capped } },
  });
  assert.ok(parsed);
  assert.equal(parsed.labels.root.icon, capped);
});

test("parseThreadLabelPayload rejects a newer version and blank labels", () => {
  assert.equal(parseThreadLabelPayload({ version: 2, labels: {} }), null);
  const parsed = parseThreadLabelPayload({
    version: 1,
    labels: {
      "": { name: "nope" },
      root: { name: "  " },
      kept: { name: "Plan", icon: ":ship:" },
    },
  });
  assert.deepEqual(parsed, {
    version: 1,
    labels: { kept: { name: "Plan", icon: ":ship:" } },
  });
});

test("boundThreadLabelStore keeps the preserved key when over the cap", () => {
  const labels = {};
  for (let index = 0; index < MAX_THREAD_LABELS + 1; index += 1) {
    labels[`root-${String(index).padStart(4, "0")}`] = {
      name: `Name ${index}`,
    };
  }
  const bounded = boundThreadLabelStore({ version: 1, labels }, "root-0000");
  assert.equal(Object.keys(bounded.labels).length, MAX_THREAD_LABELS);
  assert.equal(bounded.labels["root-0000"].name, "Name 0");
});

test("thread label store round-trips through localStorage", () => {
  memory.clear();
  __resetThreadLabelsCacheForTests();
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return memory.has(key) ? memory.get(key) : null;
      },
      setItem(key, value) {
        memory.set(key, String(value));
      },
      removeItem(key) {
        memory.delete(key);
      },
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const ok = writeThreadLabelsStore("npub-test", {
    version: 1,
    labels: { rootA: { name: "Launch plan", icon: "🚀" } },
  });
  assert.equal(ok, true);
  __resetThreadLabelsCacheForTests();
  const store = readThreadLabelsStore("npub-test");
  assert.equal(store.labels.rootA.name, "Launch plan");
  assert.equal(store.labels.rootA.icon, "🚀");
});
