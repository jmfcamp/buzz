import assert from "node:assert/strict";
import test from "node:test";

import {
  bestieSessionStorageKey,
  writeBestieSessionBoundary,
} from "./bestieSessionStorage.ts";
import {
  BESTIE_MESSAGE_THREAD_EVENT,
  bestieMessageThreadStorageKey,
  clearBestieMessageThread,
  listBestieMessageThreadRootIds,
  readBestieMessageThread,
  writeBestieMessageThread,
} from "./bestieMessageThreadStorage.ts";

const SCOPE = {
  agentPubkey: "A".repeat(64),
  ownerPubkey: "B".repeat(64),
  relayUrl: "wss://Example.COM/relay",
};

function installMemoryStorage() {
  const memory = new Map();
  const listeners = new Set();
  globalThis.window = {
    addEventListener: (type, listener) => {
      if (type === BESTIE_MESSAGE_THREAD_EVENT) listeners.add(listener);
    },
    dispatchEvent: (event) => {
      if (event?.type !== BESTIE_MESSAGE_THREAD_EVENT) return false;
      for (const listener of listeners) listener();
      return true;
    },
    localStorage: {
      getItem: (key) => memory.get(key) ?? null,
      removeItem: (key) => {
        memory.delete(key);
      },
      setItem: (key, value) => {
        memory.set(key, String(value));
      },
    },
    removeEventListener: (type, listener) => {
      if (type === BESTIE_MESSAGE_THREAD_EVENT) listeners.delete(listener);
    },
  };
  return memory;
}

test("message thread key follows the bottom assistant scope", () => {
  const key = bestieMessageThreadStorageKey(SCOPE);
  assert.match(key, /^buzz-bestie-message-thread\.v1:/);
  assert.equal(
    key.slice("buzz-bestie-message-thread.v1".length),
    bestieSessionStorageKey(SCOPE).slice("buzz-bestie-session.v1".length),
  );
});

test("each source message keeps its own thread", () => {
  installMemoryStorage();
  const first = { ...SCOPE, channelId: "channel-1", messageId: "message-a" };
  const second = { ...SCOPE, channelId: "channel-1", messageId: "message-b" };
  writeBestieMessageThread(first, {
    firstMessageCreatedAt: 10,
    sessionRootId: "root-a",
  });
  writeBestieMessageThread(second, {
    firstMessageCreatedAt: 20,
    sessionRootId: "root-b",
  });
  assert.deepEqual(readBestieMessageThread(first), {
    firstMessageCreatedAt: 10,
    sessionRootId: "root-a",
  });
  assert.equal(readBestieMessageThread(second)?.sessionRootId, "root-b");
  assert.deepEqual(listBestieMessageThreadRootIds(SCOPE).sort(), [
    "root-a",
    "root-b",
  ]);
});

test("closing one message thread leaves the other and the bottom session", () => {
  const memory = installMemoryStorage();
  writeBestieSessionBoundary(SCOPE, {
    baselineMessageIds: ["old"],
    firstMessageCreatedAt: 1,
    sessionRootId: "footer-root",
  });
  const first = { ...SCOPE, channelId: "channel-1", messageId: "message-a" };
  const second = { ...SCOPE, channelId: "channel-1", messageId: "message-b" };
  writeBestieMessageThread(first, {
    firstMessageCreatedAt: 10,
    sessionRootId: "root-a",
  });
  writeBestieMessageThread(second, {
    firstMessageCreatedAt: 20,
    sessionRootId: "root-b",
  });
  const footerBefore = memory.get(bestieSessionStorageKey(SCOPE));
  clearBestieMessageThread(first);
  assert.equal(readBestieMessageThread(first), null);
  assert.equal(readBestieMessageThread(second)?.sessionRootId, "root-b");
  assert.equal(memory.get(bestieSessionStorageKey(SCOPE)), footerBefore);
  assert.deepEqual(listBestieMessageThreadRootIds(SCOPE), ["root-b"]);
});

test("same message id is one thread across case differences", () => {
  installMemoryStorage();
  writeBestieMessageThread(
    { ...SCOPE, channelId: "Channel-1", messageId: "ABC" },
    { firstMessageCreatedAt: 5, sessionRootId: "root-1" },
  );
  assert.equal(
    readBestieMessageThread({
      ...SCOPE,
      channelId: "channel-1",
      messageId: "abc",
    })?.sessionRootId,
    "root-1",
  );
});
