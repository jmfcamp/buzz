import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetBestieCoffeeStoreForTests,
  abandonBestieCoffeePendingForScope,
  applyBestieCoffeeAgentReply,
  beginBestieCoffeeRunForScope,
  getBestieCoffeeState,
  setBestieCoffeePendingTriggerForScope,
} from "./bestieCoffeeStore.ts";
import {
  clearStalePendingOnLoad,
  parseBestieCoffeeState,
} from "./bestieCoffeeStorage.ts";
import { BESTIE_COFFEE_ABANDONED_OUTPUT } from "./bestieCoffeeLive.ts";

const SCOPE = {
  agentPubkey: "c".repeat(64),
  ownerPubkey: "d".repeat(64),
  relayUrl: "wss://relay.test",
};

function memoryWindow() {
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
}

test("captures error / NCP reply when parent is coffee trigger", () => {
  memoryWindow();
  __resetBestieCoffeeStoreForTests();
  const startedAt = 1_700_000_000;
  beginBestieCoffeeRunForScope(SCOPE, "brew", startedAt);
  setBestieCoffeePendingTriggerForScope(SCOPE, "coffee-trigger-1");
  const ok = applyBestieCoffeeAgentReply(
    SCOPE,
    "agent-reply-1",
    "NCPs aren't enabled on this agent.",
    startedAt + 30,
    [
      ["e", "coffee-trigger-1", "", "root"],
      ["e", "coffee-trigger-1", "", "reply"],
    ],
  );
  assert.equal(ok, true);
  const state = getBestieCoffeeState(SCOPE);
  assert.equal(state.pendingRun, null);
  assert.equal(state.entries.length, 1);
  assert.match(state.entries[0].fullOutput, /NCPs aren't enabled/);
  assert.match(state.entries[0].brief, /NCPs aren't enabled/);
});

test("does not capture summarize reply while coffee pending", () => {
  memoryWindow();
  __resetBestieCoffeeStoreForTests();
  const startedAt = 1_700_000_100;
  beginBestieCoffeeRunForScope(SCOPE, "brew", startedAt);
  setBestieCoffeePendingTriggerForScope(SCOPE, "coffee-trigger-2");
  const ok = applyBestieCoffeeAgentReply(
    SCOPE,
    "agent-summarize-1",
    "Here is the thread summary…",
    startedAt + 30,
    [
      ["e", "summarize-trigger", "", "root"],
      ["e", "summarize-trigger", "", "reply"],
    ],
  );
  assert.equal(ok, false);
  assert.ok(getBestieCoffeeState(SCOPE).pendingRun);
  assert.equal(getBestieCoffeeState(SCOPE).entries.length, 0);
});

test("captures reply to unmatched coffee trigger without pending", () => {
  memoryWindow();
  __resetBestieCoffeeStoreForTests();
  const unmatched = new Map([["coffee-trigger-3", "brew"]]);
  const ok = applyBestieCoffeeAgentReply(
    SCOPE,
    "agent-reply-3",
    "Skill failed: connection refused.",
    1_700_000_200,
    [["e", "coffee-trigger-3", "", "reply"]],
    unmatched,
  );
  assert.equal(ok, true);
  const entry = getBestieCoffeeState(SCOPE).entries[0];
  assert.match(entry.fullOutput, /connection refused/);
  assert.equal(entry.triggerMessageId, "coffee-trigger-3");
});

test("abandon pending with trigger finalizes failure entry and clears lock", () => {
  memoryWindow();
  __resetBestieCoffeeStoreForTests();
  const startedAt = 1_700_000_300;
  beginBestieCoffeeRunForScope(SCOPE, "brew", startedAt);
  setBestieCoffeePendingTriggerForScope(SCOPE, "coffee-trigger-abandon");
  abandonBestieCoffeePendingForScope(SCOPE, undefined, startedAt + 120);
  const state = getBestieCoffeeState(SCOPE);
  assert.equal(state.pendingRun, null);
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].fullOutput, BESTIE_COFFEE_ABANDONED_OUTPUT);
  assert.equal(state.entries[0].triggerMessageId, "coffee-trigger-abandon");
});

test("abandon pending without trigger only clears lock", () => {
  memoryWindow();
  __resetBestieCoffeeStoreForTests();
  beginBestieCoffeeRunForScope(SCOPE, "brew", 1_700_000_400);
  abandonBestieCoffeePendingForScope(SCOPE);
  const state = getBestieCoffeeState(SCOPE);
  assert.equal(state.pendingRun, null);
  assert.equal(state.entries.length, 0);
});

test("load migrates stuck pending older than start grace", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(
    clearStalePendingOnLoad({
      source: "brew",
      startedAt: now - 120,
      triggerMessageId: "old",
    }, now),
    null,
  );
  const fresh = clearStalePendingOnLoad({
    source: "brew",
    startedAt: now - 5,
    triggerMessageId: null,
  }, now);
  assert.ok(fresh);
  const parsed = parseBestieCoffeeState({
    version: 1,
    entries: [],
    prefs: { hour: 8, minute: 0 },
    lastScheduledDayKey: null,
    pendingRun: {
      source: "brew",
      startedAt: now - 600,
      triggerMessageId: "stuck",
    },
  });
  assert.equal(parsed.pendingRun, null);
});
