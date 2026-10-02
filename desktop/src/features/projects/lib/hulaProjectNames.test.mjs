import assert from "node:assert/strict";
import test from "node:test";

import {
  CHANNEL_NAME_MAX_CHARS,
  allocateDisplayName,
  channelNameFits,
  channelNameWithSuffix,
  hulaDirectoryPath,
  hulaProjectChannelName,
  hulaProjectStartPath,
  portholeTarget,
  projectNameFromHulaPath,
  repoChannelName,
} from "./hulaProjectNames.ts";

test("a projects directory is named by its folder", () => {
  assert.equal(
    projectNameFromHulaPath("Hula/projects/claimminer"),
    "claimminer",
  );
  assert.equal(
    projectNameFromHulaPath(
      "/home/ubuntu/.openclaw/workspace/Hula/projects/claimminer",
    ),
    "claimminer",
  );
});

test("a path outside Hula/projects keeps the underscore rule", () => {
  assert.equal(
    projectNameFromHulaPath("Hula/hulahealth/integration-services"),
    "hulahealth_integration-services",
  );
});

test("Hula itself and a parent walk are rejected", () => {
  assert.equal(hulaDirectoryPath("Hula"), null);
  assert.equal(hulaDirectoryPath("Hula/projects/claimminer/../.."), null);
  assert.equal(projectNameFromHulaPath("Hula/projects"), null);
});

test("repo and hula-project channels use the project prefix", () => {
  assert.equal(repoChannelName("claimminer", "desktop"), "claimminer_desktop");
  assert.equal(
    repoChannelName("claimminer", "hulahealth/integration-services"),
    "claimminer_hulahealth_integration-services",
  );
  assert.equal(
    hulaProjectChannelName("claimminer", "integration-services", "payment-batch"),
    "claimminer_integration-services_payment-batch",
  );
  assert.equal(
    hulaProjectChannelName("claimminer", null, "payment-batch"),
    "claimminer_payment-batch",
  );
});

test("a collision suffix keeps a space and a name past 255 characters is refused", () => {
  assert.equal(channelNameWithSuffix("claimminer", 2), "claimminer (2)");
  const tooLong = "a".repeat(CHANNEL_NAME_MAX_CHARS + 1);
  assert.equal(channelNameFits(tooLong), false);
  assert.equal(repoChannelName("p", tooLong), null);
});

test("a Porthole link keeps path and file", () => {
  assert.deepEqual(
    portholeTarget(
      "https://porthole.example/?path=Hula/projects/claimminer/src&file=main.ts",
    ),
    { path: "Hula/projects/claimminer/src", file: "main.ts" },
  );
  assert.equal(
    hulaProjectStartPath(
      "https://porthole.example/?path=Hula/projects/claimminer/src&file=main.ts",
    ),
    "Hula/projects/claimminer/src/main.ts",
  );
});

test("the next project name is the smallest free suffix", () => {
  assert.equal(allocateDisplayName("claimminer", []), "claimminer");
  assert.equal(
    allocateDisplayName("claimminer", ["claimminer", "claimminer (3)"]),
    "claimminer (2)",
  );
  assert.equal(
    allocateDisplayName("claimminer", ["Claimminer"]),
    "claimminer",
  );
});
