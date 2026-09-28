import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetBestieCoffeeStoreForTests,
  applyBestieCoffeeAgentReply,
  beginBestieCoffeeRunForScope,
  getBestieCoffeeState,
  setBestieCoffeePendingTriggerForScope,
} from "./bestieCoffeeStore.ts";

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
