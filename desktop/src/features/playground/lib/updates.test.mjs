import assert from "node:assert/strict";
import test from "node:test";

import {
  nextPlaygroundDomUpdate,
  playgroundCardMatchesSession,
} from "./updates.ts";

const card = {
  hula: "playground",
  v: 1,
  name: "Demo",
  url: "https://app.example.com",
  pin: "1234",
  sid: "demo-1",
  stack: "hula-app",
};

test("card matches the same sid or the same stack/name pair", () => {
  assert.equal(
    playgroundCardMatchesSession(card, {
      sid: "demo-1",
      name: "Other",
    }),
    true,
  );
  assert.equal(
    playgroundCardMatchesSession(
      { ...card, sid: "other" },
      { sid: "parked", name: "Demo", stack: "hula-app" },
    ),
    true,
  );
  assert.equal(
    playgroundCardMatchesSession(
      { ...card, sid: "other", name: "Nope" },
      { sid: "parked", name: "Demo", stack: "hula-app" },
    ),
    false,
  );
});

test("first DOM hash is the baseline; later hashes are an update", () => {
  const first = nextPlaygroundDomUpdate(null, {
    hash: "aaa",
    ready: true,
  });
  assert.equal(first.changed, false);
  assert.equal(first.baseline, "aaa");
  const second = nextPlaygroundDomUpdate("aaa", {
    hash: "bbb",
    ready: true,
  });
  assert.equal(second.changed, true);
  assert.equal(second.baseline, "bbb");
  const ignored = nextPlaygroundDomUpdate(null, { hash: null, ready: false });
  assert.equal(ignored.changed, false);
});
