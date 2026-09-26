import assert from "node:assert/strict";
import test from "node:test";

import {
  addTabToBrowser,
  createOneTabBrowser,
  findBrowserByTabSid,
  isValidBrowser,
  migrateSessionsToBrowsers,
  removeTabFromBrowser,
  setActiveBrowserTab,
  isMainBrowserTab,
  mainTabSid,
} from "./browserGroups.ts";

test("createOneTabBrowser defaults browserId to sid", () => {
  const browser = createOneTabBrowser("a");
  assert.deepEqual(browser, {
    browserId: "a",
    tabSids: ["a"],
    activeTabSid: "a",
  });
});

test("migrateSessionsToBrowsers wraps orphans and keeps existing groups", () => {
  const existing = [
    {
      browserId: "g1",
      tabSids: ["a", "b"],
      activeTabSid: "b",
    },
  ];
  const browsers = migrateSessionsToBrowsers(["a", "b", "c"], existing);
  assert.equal(browsers.length, 2);
  assert.deepEqual(browsers[0], existing[0]);
  assert.deepEqual(browsers[1], createOneTabBrowser("c"));
});

test("migrate drops tabs that no longer exist and fixes active", () => {
  const browsers = migrateSessionsToBrowsers(
    ["a"],
    [{ browserId: "g1", tabSids: ["a", "gone"], activeTabSid: "gone" }],
  );
  assert.deepEqual(browsers, [
    { browserId: "g1", tabSids: ["a"], activeTabSid: "a" },
  ]);
});

test("addTabToBrowser appends and focuses", () => {
  const next = addTabToBrowser(createOneTabBrowser("a"), "b");
  assert.deepEqual(next.tabSids, ["a", "b"]);
  assert.equal(next.activeTabSid, "b");
});

test("removeTabFromBrowser activates neighbor; last tab returns null", () => {
  const two = addTabToBrowser(createOneTabBrowser("a"), "b");
  const afterCloseActive = removeTabFromBrowser(two, "b");
  assert.deepEqual(afterCloseActive, {
    browserId: "a",
    tabSids: ["a"],
    activeTabSid: "a",
  });
  assert.equal(removeTabFromBrowser(createOneTabBrowser("a"), "a"), null);
});

test("setActiveBrowserTab ignores unknown sid", () => {
  const browser = createOneTabBrowser("a");
  assert.equal(setActiveBrowserTab(browser, "nope"), browser);
  const two = addTabToBrowser(browser, "b");
  assert.equal(setActiveBrowserTab(two, "a").activeTabSid, "a");
});

test("findBrowserByTabSid and isValidBrowser", () => {
  const browsers = [createOneTabBrowser("a"), createOneTabBrowser("b")];
  assert.equal(findBrowserByTabSid(browsers, "b")?.browserId, "b");
  assert.equal(findBrowserByTabSid(browsers, "z"), null);
  assert.equal(isValidBrowser(createOneTabBrowser("x")), true);
  assert.equal(
    isValidBrowser({ browserId: "x", tabSids: ["a"], activeTabSid: "b" }),
    false,
  );
});

test("main tab is first sid; extras are not main", () => {
  const one = createOneTabBrowser("a");
  assert.equal(mainTabSid(one), "a");
  assert.equal(isMainBrowserTab(one, "a"), true);
  const two = addTabToBrowser(one, "b");
  assert.equal(isMainBrowserTab(two, "a"), true);
  assert.equal(isMainBrowserTab(two, "b"), false);
});
