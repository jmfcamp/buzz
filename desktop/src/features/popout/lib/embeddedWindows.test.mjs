import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";

import { installLocalStorage } from "../../playground/lib/testStorage.mjs";

before(() => {
  installLocalStorage();
});

afterEach(async () => {
  const { resetEmbeddedWindowsForTests } = await import("./embeddedWindows.ts");
  const { resetPopoutSettingsForTests } = await import("./popoutSettings.ts");
  resetEmbeddedWindowsForTests();
  resetPopoutSettingsForTests();
  globalThis.localStorage?.clear();
});

test("opening the same label focuses the existing embedded window", async () => {
  const {
    closeEmbeddedWindow,
    getActiveEmbeddedWindow,
    listEmbeddedWindows,
    openEmbeddedWindow,
    setEmbedInMain,
    setShowWindowsSection,
  } = await importPair();

  setShowWindowsSection(true);
  setEmbedInMain(true);
  const first = openEmbeddedWindow({
    label: "popout-thread-aaa",
    payload: { kind: "thread", title: "Design", channelId: "c1", threadId: "t1" },
  });
  const second = openEmbeddedWindow({
    label: "popout-thread-aaa",
    payload: { kind: "thread", title: "Design", channelId: "c1", threadId: "t1" },
  });
  assert.equal(listEmbeddedWindows().length, 1);
  assert.equal(first.label, second.label);
  assert.equal(getActiveEmbeddedWindow()?.label, "popout-thread-aaa");

  closeEmbeddedWindow("popout-thread-aaa");
  assert.equal(listEmbeddedWindows().length, 0);
  assert.equal(getActiveEmbeddedWindow(), null);
});

test("active embed is gated off when show-windows is off", async () => {
  const {
    getActiveEmbeddedWindow,
    openEmbeddedWindow,
    setEmbedInMain,
    setShowWindowsSection,
  } = await importPair();

  setShowWindowsSection(true);
  setEmbedInMain(true);
  openEmbeddedWindow({
    label: "popout-playground-bbb",
    payload: {
      kind: "playground",
      title: "Demo",
      playground: {
        hula: "playground",
        v: 1,
        name: "Demo",
        url: "https://app.example.com",
        sid: "demo-1",
      },
    },
  });
  assert.equal(getActiveEmbeddedWindow()?.label, "popout-playground-bbb");
  setShowWindowsSection(false);
  assert.equal(getActiveEmbeddedWindow(), null);
});

async function importPair() {
  const settings = await import("./popoutSettings.ts");
  const windows = await import("./embeddedWindows.ts");
  return { ...settings, ...windows };
}
