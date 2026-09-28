import assert from "node:assert/strict";
import test from "node:test";

import { coreListTextForDedupe } from "./bestieListStorage.ts";
import {
  __resetBestieListStoreForTests,
  applyBestieListActionsFromAgentMessage,
  applyBestieListIntentFromUserMessage,
  getBestieListSnapshot,
  getBestieListState,
} from "./bestieListStore.ts";

const SCOPE = {
  agentPubkey: "c".repeat(64),
  ownerPubkey: "d".repeat(64),
  relayUrl: "wss://relay.test",
};

test("applyBestieListActionsFromAgentMessage is idempotent per message", () => {
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
  __resetBestieListStoreForTests();

  const content = `\`\`\`bestie-list
{"op":"add","items":[{"kind":"todo","text":"From agent"}]}
\`\`\``;
  const first = applyBestieListActionsFromAgentMessage(SCOPE, "msg-1", content);
  const second = applyBestieListActionsFromAgentMessage(
    SCOPE,
    "msg-1",
    content,
  );
  assert.equal(first, 1);
  assert.equal(second, 0);
  assert.equal(getBestieListState(SCOPE).items.length, 1);
  assert.equal(getBestieListState(SCOPE).items[0].text, "From agent");
});

test("getBestieListSnapshot returns stable empty for null scope (useSyncExternalStore)", () => {
  // Regression: a fresh empty object every getSnapshot made React throw
  // "Maximum update depth exceeded" when BestieWakeController mounted with
  // listScope still null (assignment / identity not ready yet).
  const first = getBestieListSnapshot(null);
  const second = getBestieListSnapshot(null);
  assert.equal(first, second);
  assert.equal(first.items.length, 0);
});

test("applyBestieListIntentFromUserMessage adds reminders from NL once", () => {
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
  __resetBestieListStoreForTests();

  const nowMs = Date.parse("2026-09-26T15:00:00.000-07:00");
  const first = applyBestieListIntentFromUserMessage(
    SCOPE,
    "user-1",
    "Remind me to stretch in 5 minutes",
    nowMs,
  );
  const second = applyBestieListIntentFromUserMessage(
    SCOPE,
    "user-1",
    "Remind me to stretch in 5 minutes",
    nowMs,
  );
  assert.equal(first, 1);
  assert.equal(second, 0);
  const item = getBestieListState(SCOPE).items[0];
  assert.equal(item.kind, "reminder");
  assert.equal(item.text, "stretch");
  assert.equal(item.dueAt, Math.floor(nowMs / 1000) + 5 * 60);
});

test("NL user add + agent fence with same text creates one reminder", () => {
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
  __resetBestieListStoreForTests();

  const nowMs = Date.parse("2026-09-26T15:00:00.000-07:00");
  const fromNl = applyBestieListIntentFromUserMessage(
    SCOPE,
    "user-dup",
    "Remind me to water plants in 10 minutes",
    nowMs,
  );
  assert.equal(fromNl, 1);
  const dueAt = Math.floor(nowMs / 1000) + 10 * 60;
  const fence = `\`\`\`bestie-list
{"op":"add","items":[{"kind":"reminder","text":"water plants","dueAt":${dueAt}}]}
\`\`\``;
  const fromAgent = applyBestieListActionsFromAgentMessage(
    SCOPE,
    "agent-dup",
    fence,
  );
  assert.equal(fromAgent, 0);
  assert.equal(getBestieListState(SCOPE).items.length, 1);
  assert.equal(getBestieListState(SCOPE).items[0].text, "water plants");
});

test("NL + agent fence different wording still one reminder (screenshot)", () => {
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
  __resetBestieListStoreForTests();

  // Simulate NL already applied with clean text + dueAt.
  const nowMs = Date.parse("2026-09-27T20:00:00.000-07:00");
  const dueAt = Math.floor(Date.parse("2026-09-27T20:10:00.000-07:00") / 1000);
  const fromNl = applyBestieListIntentFromUserMessage(
    SCOPE,
    "user-nightly",
    "Remind me to finish the nightly reports at 8:10pm",
    nowMs,
  );
  assert.equal(fromNl, 1);
  const nlItem = getBestieListState(SCOPE).items[0];
  assert.equal(nlItem.kind, "reminder");
  assert.match(nlItem.text.toLowerCase(), /finish the nightly reports/);
  assert.ok(nlItem.dueAt);

  // Agent fence uses different text and omits dueAt — must not create a second row.
  const fence = `\`\`\`bestie-list
{"op":"add","items":[{"kind":"reminder","text":"8:10 to finish the nightly reports"}]}
\`\`\``;
  const fromAgent = applyBestieListActionsFromAgentMessage(
    SCOPE,
    "agent-nightly",
    fence,
  );
  assert.equal(fromAgent, 0);
  assert.equal(getBestieListState(SCOPE).items.length, 1);
  const kept = getBestieListState(SCOPE).items[0];
  assert.ok(kept.dueAt);
  assert.equal(coreListTextForDedupe(kept.text), "finish the nightly reports");
});
