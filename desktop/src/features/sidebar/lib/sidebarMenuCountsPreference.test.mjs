import assert from "node:assert/strict";
import test from "node:test";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
};

const preference = await import("./sidebarMenuCountsPreference.ts");

test("defaults invalid and missing sidebar menu counts preference to off", () => {
  assert.equal(preference.parseSidebarMenuCountsEnabled(null), false);
  assert.equal(preference.parseSidebarMenuCountsEnabled("yes"), false);
  assert.equal(preference.parseSidebarMenuCountsEnabled("false"), false);
  assert.equal(preference.parseSidebarMenuCountsEnabled("true"), true);
  assert.equal(preference.DEFAULT_SIDEBAR_MENU_COUNTS_ENABLED, false);
});

test("persists and exposes the sidebar menu counts preference", () => {
  preference.setSidebarMenuCountsEnabled(true);
  assert.equal(preference.getSidebarMenuCountsEnabled(), true);
  assert.equal(
    values.get(preference.SIDEBAR_MENU_COUNTS_STORAGE_KEY),
    "true",
  );

  preference.setSidebarMenuCountsEnabled(false);
  assert.equal(preference.getSidebarMenuCountsEnabled(), false);
  assert.equal(
    values.get(preference.SIDEBAR_MENU_COUNTS_STORAGE_KEY),
    "false",
  );
});
