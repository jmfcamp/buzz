import assert from "node:assert/strict";
import test from "node:test";

import {
  hulaCreateAttachment,
  hulaFindErrorMessage,
  projectFormErrorMessage,
} from "./hulaCreateForm.ts";

test("an empty path stays on name-only create", () => {
  assert.deepEqual(hulaCreateAttachment("  ", null), { error: null });
});

test("a typed path cannot submit until Find resolves it", () => {
  assert.equal(
    hulaCreateAttachment("Hula/projects/claimminer", null).error,
    "Find the project before creating it.",
  );
});

test("a resolved path is sent as the Hula attachment", () => {
  const resolved = {
    hulaPath: "Hula/projects/claimminer",
    repoPaths: ["Hula/projects/claimminer", "Hula/projects/claimminer/desktop"],
  };
  assert.deepEqual(hulaCreateAttachment("Hula/projects/claimminer", resolved), {
    error: null,
    hula: resolved,
  });
});

test("a missing OpenClaw grant tells the person to connect", () => {
  assert.equal(
    hulaFindErrorMessage(
      new Error("Not connected — no OpenClaw workspace grant is stored."),
    ),
    "Connect OpenClaw, then find the project.",
  );
});

test("a relay quota message tells the person to wait", () => {
  assert.equal(
    projectFormErrorMessage(
      new Error("rate-limited: quota exceeded; retry in 0s"),
    ),
    "The relay is busy. Wait a moment, then create the project again.",
  );
});
