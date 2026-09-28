import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetBestieCoffeeStoreForTests,
  abandonBestieCoffeePendingForScope,
  applyBestieCoffeeAgentReply,
  beginBestieCoffeeRunForScope,
  getBestieCoffeeState,
  isBestieCoffeeStubEntry,
  removeBestieCoffeeEntryForScope,
  setBestieCoffeePendingTriggerForScope,
} from "./bestieCoffeeStore.ts";
import {
  clearStalePendingOnLoad,
  parseBestieCoffeeState,
  writeBestieCoffeeState,
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

test("upgrades abandoned timeout entry when real in-thread reply arrives", () => {
  memoryWindow();
  __resetBestieCoffeeStoreForTests();
  const startedAt = 1_700_000_300;
  beginBestieCoffeeRunForScope(SCOPE, "brew", startedAt);
  setBestieCoffeePendingTriggerForScope(SCOPE, "coffee-trigger-upgrade");
  abandonBestieCoffeePendingForScope(SCOPE, BESTIE_COFFEE_ABANDONED_OUTPUT, startedAt + 90);
  const abandoned = getBestieCoffeeState(SCOPE);
  assert.equal(abandoned.pendingRun, null);
  assert.equal(abandoned.entries.length, 1);
  assert.equal(abandoned.entries[0].replyMessageId, null);
  assert.match(abandoned.entries[0].fullOutput, /timed out/);

  const unmatched = new Map([["coffee-trigger-upgrade", "brew"]]);
  const ok = applyBestieCoffeeAgentReply(
    SCOPE,
    "agent-reply-upgrade",
    "Morning brief: three priorities.",
    startedAt + 120,
    [
      ["e", "coffee-trigger-upgrade", "", "root"],
      ["e", "coffee-trigger-upgrade", "", "reply"],
    ],
    unmatched,
  );
  assert.equal(ok, true);
  const state = getBestieCoffeeState(SCOPE);
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].replyMessageId, "agent-reply-upgrade");
  assert.match(state.entries[0].fullOutput, /Morning brief/);
});

test("does not rehydrate deleted coffee from unmatched trigger reply", () => {
  memoryWindow();
  __resetBestieCoffeeStoreForTests();
  beginBestieCoffeeRunForScope(SCOPE, "brew", 1_700_000_600);
  setBestieCoffeePendingTriggerForScope(SCOPE, "coffee-trigger-deleted");
  const ok1 = applyBestieCoffeeAgentReply(
    SCOPE,
    "agent-reply-del",
    "Morning brief before delete.",
    1_700_000_630,
    [
      ["e", "coffee-trigger-deleted", "", "root"],
      ["e", "coffee-trigger-deleted", "", "reply"],
    ],
  );
  assert.equal(ok1, true);
  const entryId = getBestieCoffeeState(SCOPE).entries[0].id;
  removeBestieCoffeeEntryForScope(SCOPE, entryId);
  assert.equal(getBestieCoffeeState(SCOPE).entries.length, 0);
  assert.ok(
    getBestieCoffeeState(SCOPE).forgottenTriggerIds.includes(
      "coffee-trigger-deleted",
    ),
  );

  const unmatched = new Map([["coffee-trigger-deleted", "brew"]]);
  const ok2 = applyBestieCoffeeAgentReply(
    SCOPE,
    "agent-reply-del-2",
    "Should not come back.",
    1_700_000_640,
    [["e", "coffee-trigger-deleted", "", "reply"]],
    unmatched,
  );
  assert.equal(ok2, false);
  assert.equal(getBestieCoffeeState(SCOPE).entries.length, 0);
});


test("Path C upgrades empty-output stub with full thread reply", () => {
  memoryWindow();
  __resetBestieCoffeeStoreForTests();
  const startedAt = 1_700_000_800;
  // Open stub at 8:38 "" — trigger root known, no reply captured yet.
  writeBestieCoffeeState(SCOPE, {
    version: 1,
    entries: [
      {
        id: "stub-empty",
        ranAt: startedAt,
        brief: "",
        fullOutput: "",
        source: "scheduled",
        triggerMessageId: "coffee-trigger-stub",
        replyMessageId: null,
      },
    ],
    forgottenTriggerIds: [],
    lastScheduledDayKey: "2026-09-28",
    pendingRun: null,
    prefs: { hour: 8, minute: 0 },
  });
  __resetBestieCoffeeStoreForTests();
  let state = getBestieCoffeeState(SCOPE);
  assert.equal(state.entries.length, 1);
  assert.equal(isBestieCoffeeStubEntry(state.entries[0]), true);

  const unmatched = new Map([["coffee-trigger-stub", "scheduled"]]);
  const ok = applyBestieCoffeeAgentReply(
    SCOPE,
    "agent-full-reply",
    "Good morning, JM. Three priorities today.",
    startedAt + 120,
    [
      ["e", "coffee-trigger-stub", "", "root"],
      ["e", "coffee-trigger-stub", "", "reply"],
    ],
    unmatched,
  );
  assert.equal(ok, true);
  state = getBestieCoffeeState(SCOPE);
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].replyMessageId, "agent-full-reply");
  assert.match(state.entries[0].fullOutput, /Three priorities/);
  assert.match(state.entries[0].brief, /Good morning/);
  assert.equal(isBestieCoffeeStubEntry(state.entries[0]), false);
});

test("Path B binds pending from reply parent then captures", () => {
  memoryWindow();
  __resetBestieCoffeeStoreForTests();
  const startedAt = 1_700_000_900;
  beginBestieCoffeeRunForScope(SCOPE, "brew", startedAt);
  assert.equal(getBestieCoffeeState(SCOPE).pendingRun.triggerMessageId, null);
  const unmatched = new Map([["coffee-trigger-bind", "brew"]]);
  const ok = applyBestieCoffeeAgentReply(
    SCOPE,
    "agent-reply-bind",
    "Bound from parent root.",
    startedAt + 20,
    [["e", "coffee-trigger-bind", "", "reply"]],
    unmatched,
  );
  assert.equal(ok, true);
  const state = getBestieCoffeeState(SCOPE);
  assert.equal(state.pendingRun, null);
  assert.equal(state.entries[0].triggerMessageId, "coffee-trigger-bind");
  assert.match(state.entries[0].fullOutput, /Bound from parent/);
});

test("Path C still captures when pending bound to a different duplicate trigger", () => {
  memoryWindow();
  __resetBestieCoffeeStoreForTests();
  const startedAt = 1_700_001_000;
  beginBestieCoffeeRunForScope(SCOPE, "scheduled", startedAt);
  setBestieCoffeePendingTriggerForScope(SCOPE, "coffee-trigger-newest");
  const unmatched = new Map([
    ["coffee-trigger-oldest", "scheduled"],
    ["coffee-trigger-newest", "scheduled"],
  ]);
  const ok = applyBestieCoffeeAgentReply(
    SCOPE,
    "agent-reply-oldest",
    "Reply under the first coffee root.",
    startedAt + 30,
    [["e", "coffee-trigger-oldest", "", "reply"]],
    unmatched,
  );
  assert.equal(ok, true);
  const state = getBestieCoffeeState(SCOPE);
  assert.equal(state.entries[0].triggerMessageId, "coffee-trigger-oldest");
  assert.match(state.entries[0].fullOutput, /first coffee root/);
});
