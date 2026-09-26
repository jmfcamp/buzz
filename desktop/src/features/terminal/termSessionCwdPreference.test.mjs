import assert from "node:assert/strict";
import test from "node:test";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};

const preference = await import("./termSessionCwdPreference.ts");

test("defaults missing and blank cwd preference to home sentinel", () => {
  assert.equal(preference.parseTermSessionCwd(null), "");
  assert.equal(preference.parseTermSessionCwd(""), "");
  assert.equal(preference.parseTermSessionCwd("   "), "");
  assert.equal(preference.DEFAULT_TERM_SESSION_CWD, "");
});

test("persists and exposes an absolute cwd override", () => {
  preference.setTermSessionCwd("/Users/jm/code");
  assert.equal(preference.getTermSessionCwd(), "/Users/jm/code");
  assert.equal(
    values.get(preference.TERM_SESSION_CWD_STORAGE_KEY),
    "/Users/jm/code",
  );

  preference.setTermSessionCwd("");
  assert.equal(preference.getTermSessionCwd(), "");
});

test("resolveTermSessionCwdForAttach leaves home default unset", async () => {
  const homeDir = async () => "/Users/jm/";
  assert.equal(
    await preference.resolveTermSessionCwdForAttach("~", homeDir),
    undefined,
  );
  assert.equal(
    await preference.resolveTermSessionCwdForAttach("", homeDir),
    undefined,
  );
  assert.equal(
    await preference.resolveTermSessionCwdForAttach("~/Projects", homeDir),
    "/Users/jm/Projects",
  );
  assert.equal(
    await preference.resolveTermSessionCwdForAttach("/tmp/work", homeDir),
    "/tmp/work",
  );
});
