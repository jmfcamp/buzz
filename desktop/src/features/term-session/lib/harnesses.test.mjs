import assert from "node:assert/strict";
import test from "node:test";

import { listTermSessionHarnesses } from "./harnesses.ts";

test("lists claude and codex; available only with underlyingCliPath", () => {
  const options = listTermSessionHarnesses([
    {
      id: "claude",
      label: "Claude Code",
      availability: "available",
      underlyingCliPath: "/usr/local/bin/claude",
      requiresExternalCli: true,
      installHint: "install claude",
    },
    {
      id: "codex",
      label: "Codex",
      availability: "not_installed",
      underlyingCliPath: null,
      requiresExternalCli: true,
      installHint: "install codex",
    },
  ]);
  assert.equal(options.length, 2);
  assert.equal(options[0].id, "claude");
  assert.equal(options[0].available, true);
  assert.equal(options[1].id, "codex");
  assert.equal(options[1].available, false);
  assert.match(options[1].installHint ?? "", /codex/i);
});
