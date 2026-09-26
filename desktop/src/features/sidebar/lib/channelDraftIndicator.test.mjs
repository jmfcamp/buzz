import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  clearAllDrafts,
  initDraftStore,
  persistDraftEntry,
} from "@/features/messages/lib/useDrafts.ts";
import {
  channelShowsDraftIndicator,
  isViewingDraftSurface,
  threadShowsDraftIndicator,
} from "./channelDraftIndicator.ts";

function makeLocalStorage() {
  const store = new Map();
  return {
    get length() {
      return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

function installFreshLocalStorage() {
  const ls = makeLocalStorage();
  if (typeof globalThis.window === "undefined") {
    globalThis.window = { localStorage: ls };
  } else {
    globalThis.window.localStorage = ls;
  }
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get: () => globalThis.window.localStorage,
  });
}

beforeEach(() => {
  installFreshLocalStorage();
  initDraftStore("pub", "wss://relay.example.com");
});

afterEach(() => {
  clearAllDrafts();
});

test("isViewingDraftSurface: channel draft only when no thread open", () => {
  assert.equal(
    isViewingDraftSurface("chan-1", {
      channelId: "chan-1",
      selectedChannelId: "chan-1",
      selectedThreadId: null,
    }),
    true,
  );
  assert.equal(
    isViewingDraftSurface("chan-1", {
      channelId: "chan-1",
      selectedChannelId: "chan-1",
      selectedThreadId: "thread-1",
    }),
    false,
  );
});

test("isViewingDraftSurface: thread draft only on that thread", () => {
  assert.equal(
    isViewingDraftSurface("thread:thread-1", {
      channelId: "chan-1",
      selectedChannelId: "chan-1",
      selectedThreadId: "thread-1",
    }),
    true,
  );
  assert.equal(
    isViewingDraftSurface("thread:thread-1", {
      channelId: "chan-1",
      selectedChannelId: "chan-1",
      selectedThreadId: null,
    }),
    false,
  );
});

test("channelShowsDraftIndicator hides when viewing that draft composer", () => {
  persistDraftEntry("chan-1", "hello", "chan-1", [], []);
  assert.equal(
    channelShowsDraftIndicator("chan-1", {
      selectedChannelId: "other",
      selectedThreadId: null,
    }),
    true,
  );
  assert.equal(
    channelShowsDraftIndicator("chan-1", {
      selectedChannelId: "chan-1",
      selectedThreadId: null,
    }),
    false,
  );
});

test("thread draft shows on channel row until that thread is open", () => {
  persistDraftEntry("thread:t1", "reply", "chan-1", [], []);
  assert.equal(
    channelShowsDraftIndicator("chan-1", {
      selectedChannelId: "chan-1",
      selectedThreadId: null,
    }),
    true,
  );
  assert.equal(
    channelShowsDraftIndicator("chan-1", {
      selectedChannelId: "chan-1",
      selectedThreadId: "t1",
    }),
    false,
  );
});

test("empty draft does not show indicator", () => {
  persistDraftEntry("chan-1", "   ", "chan-1", [], []);
  assert.equal(
    channelShowsDraftIndicator("chan-1", {
      selectedChannelId: "other",
      selectedThreadId: null,
    }),
    false,
  );
});

test("threadShowsDraftIndicator shows until that thread is open", () => {
  persistDraftEntry("thread:t1", "reply draft", "chan-1", [], []);
  assert.equal(
    threadShowsDraftIndicator("t1", {
      channelId: "chan-1",
      selectedChannelId: "chan-1",
      selectedThreadId: null,
    }),
    true,
  );
  assert.equal(
    threadShowsDraftIndicator("t1", {
      channelId: "chan-1",
      selectedChannelId: "chan-1",
      selectedThreadId: "t1",
    }),
    false,
  );
  assert.equal(
    threadShowsDraftIndicator("other", {
      channelId: "chan-1",
      selectedChannelId: "other-chan",
      selectedThreadId: null,
    }),
    false,
  );
});
