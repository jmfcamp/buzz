import assert from "node:assert/strict";
import test from "node:test";

import { planHulaChannels } from "./hulaProjectPlan.ts";

const ROOT = "Hula/projects/claimminer";

test("the root uses the home channel and nested repos get their own names", () => {
  const plan = planHulaChannels({
    projectName: "claimminer",
    rootPath: ROOT,
    repoPaths: [
      ROOT,
      `${ROOT}/desktop`,
      `${ROOT}/hulahealth/integration-services`,
    ],
    takenChannelNames: [],
  });

  assert.equal(plan.homeChannelName, "claimminer");
  assert.deepEqual(
    plan.repos.map((repo) => [repo.subPath, repo.channelName, repo.dtag]),
    [
      ["", "claimminer", "claimminer"],
      ["desktop", "claimminer_desktop", "claimminer-desktop"],
      [
        "hulahealth/integration-services",
        "claimminer_hulahealth_integration-services",
        "claimminer-hulahealth-integration-services",
      ],
    ],
  );
});

test("a taken home channel is suffixed and member channels keep the project name", () => {
  const plan = planHulaChannels({
    projectName: "claimminer",
    rootPath: ROOT,
    repoPaths: [ROOT, `${ROOT}/desktop`],
    takenChannelNames: ["claimminer", "claimminer_desktop"],
  });

  assert.equal(plan.homeChannelName, "claimminer (2)");
  assert.equal(plan.repos[0].dtag, "claimminer");
  assert.equal(plan.repos[1].channelName, "claimminer_desktop (2)");
  assert.equal(plan.repos[1].dtag, "claimminer-desktop-2");
});

test("a repository outside the project is refused", () => {
  assert.throws(
    () =>
      planHulaChannels({
        projectName: "claimminer",
        rootPath: ROOT,
        repoPaths: [ROOT, "Hula/other"],
        takenChannelNames: [],
      }),
    /inside the project/,
  );
});
