import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";

import { installLocalStorage } from "./testStorage.mjs";

const card = {
  hula: "playground",
  v: 1,
  name: "Demo",
  url: "https://app.example.com",
  pin: "1234",
  sid: "demo-1",
  stack: "hula-app",
};

before(() => {
  installLocalStorage();
});

afterEach(async () => {
  const { resetPlaygroundState } = await import("./sessions.ts");
  resetPlaygroundState();
});

test("add creates a personal session; dismiss parks; dispose removes", async () => {
  const {
    addPlaygroundSession,
    configurePlaygroundScope,
    dismissPlayground,
    disposePlayground,
    getActivePlaygroundSid,
    listPlaygroundSessions,
    showPlaygroundSession,
  } = await import("./sessions.ts");

  configurePlaygroundScope("pub", "wss://relay.example.com");
  addPlaygroundSession(card);
  assert.equal(listPlaygroundSessions().length, 1);
  assert.equal(getActivePlaygroundSid(), "demo-1");

  dismissPlayground();
  assert.equal(getActivePlaygroundSid(), null);
  assert.equal(listPlaygroundSessions()[0]?.sid, "demo-1");

  showPlaygroundSession("demo-1");
  assert.equal(getActivePlaygroundSid(), "demo-1");

  disposePlayground("demo-1");
  assert.equal(listPlaygroundSessions().length, 0);
  assert.equal(getActivePlaygroundSid(), null);

  addPlaygroundSession(card);
  assert.equal(listPlaygroundSessions().length, 1);
});

test("hasPlaygroundSession tracks left-menu rows; parkPlaygroundThen dismisses", async () => {
  const {
    addPlaygroundSession,
    configurePlaygroundScope,
    getActivePlaygroundSid,
    hasPlaygroundSession,
    parkPlaygroundThen,
  } = await import("./sessions.ts");

  configurePlaygroundScope("pub", "wss://relay.example.com");
  assert.equal(hasPlaygroundSession("demo-1"), false);
  addPlaygroundSession(card);
  assert.equal(hasPlaygroundSession("demo-1"), true);
  assert.equal(getActivePlaygroundSid(), "demo-1");

  let selected = false;
  parkPlaygroundThen(() => {
    selected = true;
  })();
  assert.equal(selected, true);
  assert.equal(getActivePlaygroundSid(), null);
  assert.equal(hasPlaygroundSession("demo-1"), true);
});
