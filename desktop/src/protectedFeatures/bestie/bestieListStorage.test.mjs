import assert from "node:assert/strict";
import test from "node:test";

import {
  addBestieListItem,
  bestieListStorageKey,
  dueReminders,
  emptyBestieListState,
  parseBestieListState,
  readBestieListState,
  writeBestieListState,
} from "./bestieListStorage.ts";

const SCOPE = {
  agentPubkey: "A".repeat(64),
  ownerPubkey: "B".repeat(64),
  relayUrl: "wss://Example.COM/relay",
};

test("storage key is scoped by relay and owner only (no agent)", () => {
  const key = bestieListStorageKey(SCOPE);
  assert.match(key, /^buzz-bestie-list\.v1:/);
  assert.match(key, /b{64}/);
  assert.doesNotMatch(key, /:a{64}$/);
  assert.equal(
    bestieListStorageKey({ ...SCOPE, agentPubkey: "c".repeat(64) }),
    key,
  );
});

test("parseBestieListState accepts valid payloads only", () => {
  assert.equal(parseBestieListState(null), null);
  assert.equal(parseBestieListState({ version: 2, items: [] }), null);
  const parsed = parseBestieListState({
    version: 1,
    items: [
      {
        id: "1",
        kind: "todo",
        text: " Ship ",
        status: "open",
        createdAt: 1,
        updatedAt: 1,
        dueAt: null,
        sourceMessageId: null,
      },
      { id: "bad" },
    ],
    processedMessageIds: ["m1", 2],
  });
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].text, "Ship");
  assert.deepEqual(parsed.processedMessageIds, ["m1"]);
});

test("read/write round-trip through localStorage", () => {
  const memory = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => memory.get(key) ?? null,
      removeItem: (key) => {
        memory.delete(key);
      },
      setItem: (key, value) => {
        memory.set(key, String(value));
      },
    },
  };

  let state = emptyBestieListState();
  state = addBestieListItem(state, { kind: "todo", text: "One" }, 10);
  state = addBestieListItem(
    state,
    { kind: "reminder", text: "Two", dueAt: 5 },
    11,
  );
  writeBestieListState(SCOPE, state);
  const loaded = readBestieListState(SCOPE);
  assert.equal(loaded.items.length, 2);
  assert.equal(dueReminders(loaded, 5).length, 1);
  assert.equal(dueReminders(loaded, 4).length, 0);
});

test("addBestieListItem dedupes same kind+text within due window", () => {
  let state = emptyBestieListState();
  state = addBestieListItem(
    state,
    { kind: "reminder", text: "Stretch", dueAt: 1000 },
    900,
  );
  const again = addBestieListItem(
    state,
    { kind: "reminder", text: "stretch", dueAt: 1050 },
    910,
  );
  assert.equal(again.items.length, 1);
  assert.equal(again.items[0].text, "Stretch");
});

test("addBestieListItem dedupes recent open item even if due differs", () => {
  let state = emptyBestieListState();
  state = addBestieListItem(
    state,
    { kind: "reminder", text: "Call mom", dueAt: 1000 },
    900,
  );
  const again = addBestieListItem(
    state,
    { kind: "reminder", text: "Call mom", dueAt: 5000 },
    950,
  );
  assert.equal(again.items.length, 1);
});

test("migrates legacy agent-scoped list keys into owner scope", () => {
  const memory = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => memory.get(key) ?? null,
      key: (index) => [...memory.keys()][index] ?? null,
      get length() {
        return memory.size;
      },
      removeItem: (key) => {
        memory.delete(key);
      },
      setItem: (key, value) => {
        memory.set(key, String(value));
      },
    },
  };

  const legacyKey = `${bestieListStorageKey(SCOPE)}:${SCOPE.agentPubkey.toLowerCase()}`;
  let legacy = emptyBestieListState();
  legacy = addBestieListItem(legacy, { kind: "todo", text: "Persist me" }, 10);
  memory.set(legacyKey, JSON.stringify(legacy));

  const loaded = readBestieListState(SCOPE);
  assert.equal(loaded.items.length, 1);
  assert.equal(loaded.items[0].text, "Persist me");
  assert.equal(memory.has(legacyKey), false);
  assert.ok(memory.has(bestieListStorageKey(SCOPE)));

  // Different agent same owner still sees the data
  const otherAgent = readBestieListState({
    ...SCOPE,
    agentPubkey: "d".repeat(64),
  });
  assert.equal(otherAgent.items[0].text, "Persist me");
});
