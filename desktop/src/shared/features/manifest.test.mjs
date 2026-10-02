import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(
  readFileSync(
    new URL("../../../../preview-features.json", import.meta.url),
    "utf8",
  ),
);

test("Workflows stays a preview and Projects is a normal surface", () => {
  const ids = manifest.features.map((feature) => feature.id);
  assert.equal(ids.includes("projects"), false);
  assert.deepEqual(
    manifest.features.find((feature) => feature.id === "workflows"),
    {
      id: "workflows",
      name: "Workflows",
      description: "YAML-defined automations with approval gates",
      platforms: ["desktop"],
    },
  );
});
