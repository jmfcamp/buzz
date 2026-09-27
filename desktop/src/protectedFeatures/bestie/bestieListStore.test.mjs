import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetBestieListStoreForTests,
  applyBestieListActionsFromAgentMessage,
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
