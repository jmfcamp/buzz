import assert from "node:assert/strict";
import test from "node:test";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const pref = await import("./termPreferences.ts");
pref.resetTermPreferencesForTests();

test("cwd blank is the login-shell default sentinel", () => {
  assert.equal(pref.parseTermCwd(null), "");
  assert.equal(pref.parseTermCwd("  "), "");
  assert.equal(pref.parseTermCwd("/tmp"), "/tmp");
});

test("scrollback clamps to the supported range", () => {
  assert.equal(pref.parseTermScrollback(null), 10_000);
  assert.equal(pref.parseTermScrollback("50"), 100);
  assert.equal(pref.parseTermScrollback("999999"), 100_000);
  assert.equal(pref.parseTermScrollback("5000"), 5000);
});

test("font size only accepts the offered steps", () => {
  assert.equal(pref.parseTermFontSize("14"), 14);
  assert.equal(pref.parseTermFontSize("13"), 14);
  assert.equal(pref.parseTermFontSize("18"), 18);
});

test("open mode defaults to docked", () => {
  assert.equal(pref.parseTermOpenMode(null), "docked");
  assert.equal(pref.parseTermOpenMode("maximized"), "maximized");
});

test("handoff cwd wins over preference when resolving attach cwd", async () => {
  const homeDir = async () => "/Users/jm";
  assert.equal(
    await pref.resolveTermCwdForAttach({
      preference: "/pref",
      handoffCwd: "~/work",
      homeDir,
    }),
    "/Users/jm/work",
  );
  assert.equal(
    await pref.resolveTermCwdForAttach({
      preference: "",
      homeDir,
    }),
    undefined,
  );
});

test("cell metrics scale from the 14px baseline", () => {
  const m = pref.terminalCellMetricsForFontSize(16);
  // 28 is not in TERM_FONT_SIZES at runtime callers, but the helper is pure.
  assert.equal(m.font.includes("16px"), true);
  const at14 = pref.terminalCellMetricsForFontSize(14);
  assert.equal(at14.height, 17);
  const at12 = pref.terminalCellMetricsForFontSize(12);
  assert.ok(at12.height < at14.height);
});

test("persists shell and open mode", () => {
  pref.setTermShell("/bin/zsh");
  pref.setTermOpenMode("maximized");
  assert.equal(pref.getTermPreferences().shell, "/bin/zsh");
  assert.equal(pref.getTermPreferences().openMode, "maximized");
  assert.equal(values.get(pref.TERM_PREF_KEYS.shell), "/bin/zsh");
});

test("session host defaults to buzz-term", () => {
  assert.equal(pref.parseTermSessionHost(null), "buzz-term");
  pref.setTermSessionHost("herdr");
  assert.equal(pref.getTermPreferences().sessionHost, "herdr");
});

test("session name defaults to buzz; blank opts into herdr default", () => {
  assert.equal(pref.parseTermSessionName(null), "buzz");
  assert.equal(pref.parseTermSessionName(undefined), "buzz");
  assert.equal(pref.parseTermSessionName(""), "");
  assert.equal(pref.parseTermSessionName("  agent  "), "agent");
  pref.setTermSessionName("agent");
  assert.equal(pref.getTermPreferences().sessionName, "agent");
  assert.equal(values.get(pref.TERM_PREF_KEYS.sessionName), "agent");
  pref.setTermSessionName("");
  assert.equal(pref.getTermPreferences().sessionName, "");
});
