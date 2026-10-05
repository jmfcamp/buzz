import assert from "node:assert/strict";
import test from "node:test";

import {
  bestieThreadShouldCheckForNewerMessages,
  newestThreadReplyCreatedAt,
} from "./bestieThreadActivityRefresh.ts";

test("skip poll when never summarized", () => {
  assert.equal(
    bestieThreadShouldCheckForNewerMessages(
      { id: "ch:root", lastSummaryAt: null },
      null,
    ),
    false,
  );
});

test("skip poll when summarize is pending for that thread", () => {
  assert.equal(
    bestieThreadShouldCheckForNewerMessages(
      { id: "ch:root", lastSummaryAt: 100 },
      "ch:root",
    ),
    false,
  );
});

test("poll when already summarized and not pending", () => {
  assert.equal(
    bestieThreadShouldCheckForNewerMessages(
      { id: "ch:root", lastSummaryAt: 100 },
      null,
    ),
    true,
  );
  assert.equal(
    bestieThreadShouldCheckForNewerMessages(
      { id: "ch:root", lastSummaryAt: 100 },
      "other",
    ),
    true,
  );
});

test("newest reply created_at ignores bad values", () => {
  assert.equal(newestThreadReplyCreatedAt([]), null);
  assert.equal(
    newestThreadReplyCreatedAt([
      { created_at: 10 },
      { created_at: Number.NaN },
      { created_at: 50 },
      { created_at: 40 },
    ]),
    50,
  );
});

import {
  __resetBestieThreadStoreForTests,
  beginBestieThreadSummarizeForScope,
  getBestieThreadState,
  setBestieThreadSummarizeTriggerForScope,
  upsertBestieTrackedThreadForScope,
} from "./bestieThreadStore.ts";
import { writeBestieThreadState } from "./bestieThreadStorage.ts";
import { bestieThreadNeedsSummarize } from "./bestieThreadSummarizeEligibility.ts";
import { refreshBestieTrackedThreadActivity } from "./bestieThreadActivityRefresh.ts";

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

test("refresh bumps lastActiveAt when a reply is newer than lastSummaryAt", async () => {
  memoryWindow();
  __resetBestieThreadStoreForTests();
  upsertBestieTrackedThreadForScope(SCOPE, {
    channelId: "chan-a",
    preview: "hello",
    rootEventId: "root-a",
    source: "ask",
    lastActiveAt: 1_000,
  });
  beginBestieThreadSummarizeForScope(SCOPE, "chan-a:root-a");
  setBestieThreadSummarizeTriggerForScope(SCOPE, "trig");
  // Force summary timestamps via storage complete path.
  const pending = getBestieThreadState(SCOPE);
  writeBestieThreadState(SCOPE, {
    ...pending,
    pendingSummarize: null,
    threads: pending.threads.map((thread) =>
      thread.id === "chan-a:root-a"
        ? {
            ...thread,
            lastActiveAt: 1_500,
            lastSummary: "Prior brief",
            lastSummaryAt: 1_500,
          }
        : thread,
    ),
  });
  __resetBestieThreadStoreForTests();

  assert.equal(
    bestieThreadNeedsSummarize(getBestieThreadState(SCOPE).threads[0]),
    false,
  );

  await refreshBestieTrackedThreadActivity(SCOPE, {
    fetchReplies: async () => ({
      events: [{ created_at: 1_400 }, { created_at: 1_800 }],
      nextCursor: null,
    }),
  });

  const thread = getBestieThreadState(SCOPE).threads[0];
  assert.equal(thread.lastActiveAt, 1_800);
  assert.equal(thread.lastSummaryAt, 1_500);
  assert.equal(bestieThreadNeedsSummarize(thread), true);
});

test("refresh skips never-summarized and swallows fetch errors", async () => {
  memoryWindow();
  __resetBestieThreadStoreForTests();
  upsertBestieTrackedThreadForScope(SCOPE, {
    channelId: "chan-b",
    preview: "new",
    rootEventId: "root-b",
    source: "agent",
    lastActiveAt: 100,
  });
  // Never summarized — must not call fetcher.
  let calls = 0;
  await refreshBestieTrackedThreadActivity(SCOPE, {
    fetchReplies: async () => {
      calls += 1;
      throw new Error("should not run");
    },
  });
  assert.equal(calls, 0);

  // Summarized row + failing fetch must not throw.
  writeBestieThreadState(SCOPE, {
    ...getBestieThreadState(SCOPE),
    threads: [
      {
        ...getBestieThreadState(SCOPE).threads[0],
        lastSummary: "x",
        lastSummaryAt: 200,
        lastActiveAt: 200,
      },
    ],
  });
  __resetBestieThreadStoreForTests();
  await refreshBestieTrackedThreadActivity(SCOPE, {
    fetchReplies: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(getBestieThreadState(SCOPE).threads[0].lastActiveAt, 200);
});
