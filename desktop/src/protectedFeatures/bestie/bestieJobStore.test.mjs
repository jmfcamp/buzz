import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetBestieJobStoreForTests,
  applyBestieJobActionsFromAgentMessage,
  applyBestieJobIntentFromUserMessage,
  getBestieJobState,
} from "./bestieJobStore.ts";

const SCOPE = {
  agentPubkey: "c".repeat(64),
  ownerPubkey: "d".repeat(64),
  relayUrl: "wss://relay.test",
};

function mockStorage() {
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

test("job create via fence and NL; fence+NL same content dedupes", () => {
  mockStorage();
  __resetBestieJobStoreForTests();
  const nowMs = Date.parse("2026-09-27T12:00:00.000-07:00");
  const nl = applyBestieJobIntentFromUserMessage(
    SCOPE,
    "u1",
    "Schedule a job in 5 minutes to summarize my inbox",
    nowMs,
  );
  assert.equal(nl, 1);
  const dueAt = Math.floor(nowMs / 1000) + 5 * 60;
  const fence = `\`\`\`bestie-job
{"op":"add","job":{"title":"summarize my inbox","prompt":"summarize my inbox","schedule":{"kind":"once","dueAt":${dueAt}}}}
\`\`\``;
  const agent = applyBestieJobActionsFromAgentMessage(SCOPE, "a1", fence);
  assert.equal(agent, 0);
  assert.equal(getBestieJobState(SCOPE).jobs.length, 1);
});
