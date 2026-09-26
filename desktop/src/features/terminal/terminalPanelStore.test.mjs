import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  resetTerminalPanelForTests,
  setTerminalPanelMode,
  setTerminalSessionChannels,
  toggleTerminalPanel,
  openTerminalPanel,
  setTerminalTabScope,
  getTerminalPanelSnapshotForTests,
  leaveLeftNavBuzzTerm,
  leaveLeftNavBuzzTermThen,
  isLeftNavBuzzTermActive,
  isPrimaryNavRowActive,
} from "./terminalPanelStore.ts";

beforeEach(resetTerminalPanelForTests);

test("panel toggles between closed and the docked default", () => {
  toggleTerminalPanel();
  assert.equal(getTerminalPanelSnapshotForTests().mode, "docked");
  assert.equal(getTerminalPanelSnapshotForTests().tabScope, "channel");
  toggleTerminalPanel();
  assert.equal(getTerminalPanelSnapshotForTests().mode, "closed");
  setTerminalPanelMode("maximized");
  toggleTerminalPanel();
  assert.equal(getTerminalPanelSnapshotForTests().mode, "closed");
});

test("left-nav open uses global all scope without wiping mode later", () => {
  openTerminalPanel("maximized", "all");
  assert.equal(getTerminalPanelSnapshotForTests().mode, "maximized");
  assert.equal(getTerminalPanelSnapshotForTests().tabScope, "all");
  setTerminalPanelMode("docked");
  assert.equal(getTerminalPanelSnapshotForTests().tabScope, "all");
  setTerminalTabScope("channel");
  assert.equal(getTerminalPanelSnapshotForTests().tabScope, "channel");
});

test("session channel identities are de-duplicated", () => {
  setTerminalSessionChannels(["one", "one", "two"]);
  // Regression guard: accepting an iterable (rather than Session objects) keeps
  // this store UI-only and prevents mutable PTYs from leaking into header state.
  setTerminalSessionChannels(new Set(["one", "two"]));
  assert.deepEqual(
    [...getTerminalPanelSnapshotForTests().sessionChannelIds],
    ["one", "two"],
  );
});

test("leaveLeftNavBuzzTerm closes only all-scope exclusive panel", () => {
  openTerminalPanel("maximized", "all");
  assert.equal(isLeftNavBuzzTermActive(), true);
  leaveLeftNavBuzzTerm();
  assert.equal(getTerminalPanelSnapshotForTests().mode, "closed");
  assert.equal(isLeftNavBuzzTermActive(), false);

  openTerminalPanel("docked", "channel");
  assert.equal(isLeftNavBuzzTermActive(), false);
  leaveLeftNavBuzzTerm();
  assert.equal(getTerminalPanelSnapshotForTests().mode, "docked");
  assert.equal(getTerminalPanelSnapshotForTests().tabScope, "channel");
});

test("leaveLeftNavBuzzTermThen runs destination after closing all-scope", () => {
  openTerminalPanel("maximized", "all");
  let ran = false;
  leaveLeftNavBuzzTermThen(() => {
    ran = true;
  })();
  assert.equal(ran, true);
  assert.equal(getTerminalPanelSnapshotForTests().mode, "closed");
});

test("opening left-nav Buzz Term clears peer primary-nav row selection", () => {
  assert.equal(isPrimaryNavRowActive(true), true);
  openTerminalPanel("maximized", "all");
  assert.equal(isLeftNavBuzzTermActive(), true);
  assert.equal(
    isPrimaryNavRowActive(true),
    false,
    "Agents/Browsers/etc must not stay highlighted under Buzz Term",
  );
  leaveLeftNavBuzzTerm();
  assert.equal(isPrimaryNavRowActive(true), true);
  assert.equal(isPrimaryNavRowActive(false), false);
});
