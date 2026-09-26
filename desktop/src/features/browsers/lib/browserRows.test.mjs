import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSER_ROW_COLD_CHIP,
  browserRowLivenessChip,
  browserRowShowsOpenButton,
  buildBrowserListRows,
  findGrantForRow,
} from "./browserRows.ts";

test("buildBrowserListRows lists one row per browser group and marks detached", () => {
  const rows = buildBrowserListRows({
    sessions: [
      {
        sid: "abc",
        name: "Demo",
        url: "https://example.com/demo",
      },
      {
        sid: "xyz",
        name: "Embedded",
        url: "https://example.com/embedded",
      },
    ],
    detached: [
      {
        label: "popout-playground-1",
        title: "Demo",
        playgroundSid: "abc",
      },
    ],
  });

  assert.equal(rows.length, 2);
  const windowed = rows.find((row) => row.surfaceId === "abc");
  const main = rows.find((row) => row.surfaceId === "xyz");
  assert.ok(windowed);
  assert.ok(main);
  assert.equal(windowed.host, "windowed");
  assert.equal(windowed.popoutLabel, "popout-playground-1");
  assert.equal(windowed.browserId, "abc");
  assert.equal(windowed.tabCount, 1);
  assert.equal(main.host, "main");
  assert.equal(main.popoutLabel, undefined);
});

test("buildBrowserListRows: main row is main tab; secondaryTabs list extras", () => {
  const rows = buildBrowserListRows({
    sessions: [
      { sid: "t1", name: "One", url: "https://a.example" },
      { sid: "t2", name: "Two", url: "https://b.example" },
    ],
    browsers: [
      {
        browserId: "g1",
        tabSids: ["t1", "t2"],
        activeTabSid: "t2",
      },
    ],
    detached: [],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].browserId, "g1");
  // Active tab still tracked for grants / focus.
  assert.equal(rows[0].surfaceId, "t2");
  // Main row chrome uses main tab (tabSids[0]).
  assert.equal(rows[0].mainSurfaceId, "t1");
  assert.equal(rows[0].title, "One");
  assert.equal(rows[0].url, "https://a.example");
  assert.equal(rows[0].tabCount, 2);
  assert.deepEqual(rows[0].secondaryTabs, [
    { surfaceId: "t2", title: "Two", url: "https://b.example" },
  ]);
});

test("findGrantForRow matches surface and window label", () => {
  const grant = findGrantForRow(
    [
      {
        webviewLabel: "playground-abc",
        surface: "playground",
        surfaceId: "abc",
        agentId: "a",
        agentPubkey: "pk",
        channelId: "c",
        mode: "observe",
        createdAtMs: 1,
      },
    ],
    { surfaceId: "abc", windowLabel: "main" },
  );
  assert.equal(grant?.mode, "observe");
});

test("browserRowLivenessChip is Cold when webview not open, omitted when live", () => {
  assert.equal(browserRowLivenessChip(false), BROWSER_ROW_COLD_CHIP);
  assert.equal(browserRowLivenessChip(false), "Cold");
  assert.equal(browserRowLivenessChip(true), null);
});

test("Open button: main only; all detached rows hide it", () => {
  assert.equal(browserRowShowsOpenButton({ host: "main" }), true);
  assert.equal(browserRowShowsOpenButton({ host: "windowed" }), false);
});
