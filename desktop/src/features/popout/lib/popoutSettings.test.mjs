import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";

import { installLocalStorage } from "../../playground/lib/testStorage.mjs";

before(() => {
  installLocalStorage();
});

afterEach(async () => {
  const { resetPopoutSettingsForTests } = await import("./popoutSettings.ts");
  resetPopoutSettingsForTests();
  globalThis.localStorage?.clear();
});

test("embed is gated by show-windows: off forces embed off and locks it", async () => {
  const {
    EMBED_IN_MAIN_KEY,
    SHOW_WINDOWS_SECTION_KEY,
    isEmbedInMainEnabled,
    isShowWindowsSectionEnabled,
    setEmbedInMain,
    setShowWindowsSection,
  } = await import("./popoutSettings.ts");

  setShowWindowsSection(true);
  setEmbedInMain(true);
  assert.equal(isShowWindowsSectionEnabled(), true);
  assert.equal(isEmbedInMainEnabled(), true);
  assert.equal(globalThis.localStorage.getItem(EMBED_IN_MAIN_KEY), "true");

  setShowWindowsSection(false);
  assert.equal(isShowWindowsSectionEnabled(), false);
  assert.equal(isEmbedInMainEnabled(), false);
  assert.equal(globalThis.localStorage.getItem(SHOW_WINDOWS_SECTION_KEY), "false");
  assert.equal(globalThis.localStorage.getItem(EMBED_IN_MAIN_KEY), "false");

  setEmbedInMain(true);
  assert.equal(isEmbedInMainEnabled(), false);
  assert.equal(globalThis.localStorage.getItem(EMBED_IN_MAIN_KEY), "false");
});

test("turning show-windows back on does not revive embed", async () => {
  const {
    isEmbedInMainEnabled,
    setEmbedInMain,
    setShowWindowsSection,
  } = await import("./popoutSettings.ts");

  setShowWindowsSection(true);
  setEmbedInMain(true);
  setShowWindowsSection(false);
  setShowWindowsSection(true);
  assert.equal(isEmbedInMainEnabled(), false);
});

test("start-fullscreen defaults off and persists", async () => {
  const {
    START_FULLSCREEN_KEY,
    isStartFullscreenEnabled,
    setStartFullscreen,
  } = await import("./popoutSettings.ts");

  assert.equal(isStartFullscreenEnabled(), false);
  setStartFullscreen(true);
  assert.equal(isStartFullscreenEnabled(), true);
  assert.equal(globalThis.localStorage.getItem(START_FULLSCREEN_KEY), "true");
});
