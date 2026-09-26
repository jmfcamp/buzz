import assert from "node:assert/strict";
import test from "node:test";

/**
 * disposeBrowserSession talks to Tauri + playground store; host selection is
 * pure enough to unit-check here via the same branching the helper uses.
 */
function resolveDisposeHost(row, isEmbeddedLabel) {
  if (row.host === "windowed") {
    const label = row.popoutLabel ?? row.windowLabel;
    if (label && label !== "main") {
      return isEmbeddedLabel(label) ? "embed" : "os";
    }
  }
  return "main";
}

test("dispose host is os for windowed popout label", () => {
  assert.equal(
    resolveDisposeHost(
      {
        host: "windowed",
        popoutLabel: "popout-playground-1",
        windowLabel: "popout-playground-1",
      },
      () => false,
    ),
    "os",
  );
});

test("dispose host is embed when label is embedded", () => {
  assert.equal(
    resolveDisposeHost(
      {
        host: "windowed",
        popoutLabel: "popout-playground-1",
        windowLabel: "popout-playground-1",
      },
      (label) => label === "popout-playground-1",
    ),
    "embed",
  );
});

test("dispose host is main for in-app rows", () => {
  assert.equal(
    resolveDisposeHost({ host: "main", windowLabel: "main" }, () => false),
    "main",
  );
});
