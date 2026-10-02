import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { showRelayRepositoryControls } from "./projectRepositoryControls.ts";

test("both repository controls use the OpenClaw gate", () => {
  const source = readFileSync(
    new URL("../ui/ProjectRepositoryManagement.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /!hideTriggers && showRelayControls/);
  assert.match(source, /canManageAccess && showRelayControls/);
});

test("an OpenClaw path hides add-repository and access-channel controls", () => {
  assert.equal(
    showRelayRepositoryControls({
      projectHulaPath: null,
      repositoryHulaPath: null,
    }),
    true,
  );
  assert.equal(showRelayRepositoryControls({ projectHulaPath: "   " }), true);
  assert.equal(
    showRelayRepositoryControls({
      projectHulaPath: "Hula/projects/claimminer",
    }),
    false,
  );
  assert.equal(
    showRelayRepositoryControls({
      repositoryHulaPath: "Hula/projects/claimminer/desktop",
    }),
    false,
  );
});
