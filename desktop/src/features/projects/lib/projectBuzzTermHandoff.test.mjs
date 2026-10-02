import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProjectBuzzTermPrompt,
  filterProjectBuzzTermAgents,
  projectBuzzTermLaunchAllowed,
} from "./projectBuzzTermHandoff.ts";

const local = {
  backend: { type: "local" },
  status: "running",
};

test("Buzz Term launches only on the OpenClaw checkout", () => {
  assert.equal(
    projectBuzzTermLaunchAllowed({
      openClaw: true,
      viewedBranch: "main",
      checkedOutBranch: "main",
    }).allowed,
    true,
  );
  assert.equal(
    projectBuzzTermLaunchAllowed({
      openClaw: true,
      viewedBranch: "feature",
      checkedOutBranch: "main",
    }).allowed,
    false,
  );
  assert.match(
    projectBuzzTermLaunchAllowed({
      openClaw: true,
      viewedBranch: "feature",
      checkedOutBranch: "main",
    }).title,
    /main/,
  );
  assert.equal(
    projectBuzzTermLaunchAllowed({
      openClaw: true,
      viewedBranch: "main",
      checkedOutBranch: "main",
      selectedTag: "v1",
    }).allowed,
    false,
  );
  assert.equal(
    projectBuzzTermLaunchAllowed({
      openClaw: true,
      viewedBranch: "main",
      checkedOutBranch: "  ",
    }).allowed,
    false,
  );
  assert.equal(
    projectBuzzTermLaunchAllowed({
      openClaw: false,
      viewedBranch: "feature",
      checkedOutBranch: null,
    }).allowed,
    true,
  );
});

test("an OpenClaw checkout lists only running agents with OpenClaw enabled", () => {
  const agents = [
    { ...local, pubkey: "a", useOpenClawWorkspace: true },
    { ...local, pubkey: "b", useOpenClawWorkspace: false },
    {
      ...local,
      pubkey: "c",
      status: "stopped",
      useOpenClawWorkspace: true,
    },
    {
      backend: { type: "remote" },
      pubkey: "d",
      status: "running",
      useOpenClawWorkspace: true,
    },
  ];
  assert.deepEqual(
    filterProjectBuzzTermAgents(agents, true).map((agent) => agent.pubkey),
    ["a"],
  );
  assert.deepEqual(
    filterProjectBuzzTermAgents(agents, false).map((agent) => agent.pubkey),
    ["a", "b"],
  );
});

test("the Buzz Term prompt names the place on the OpenClaw checkout", () => {
  const prompt = buildProjectBuzzTermPrompt({
    projectName: "claimminer",
    repositoryName: "desktop",
    openClawPath: "Hula/projects/claimminer/desktop",
    branch: "main",
    view: "Files",
    file: { kind: "file", path: "src/app.ts" },
    workItem: null,
  });
  assert.match(prompt, /OpenClaw workspace tools/);
  assert.match(prompt, /Do not check out another branch/);
  assert.match(prompt, /"claimminer"/);
  assert.match(prompt, /"desktop"/);
  assert.match(prompt, /Hula\/projects\/claimminer\/desktop/);
  assert.match(prompt, /"main"/);
  assert.match(prompt, /Files/);
  assert.match(prompt, /src\/app\.ts/);
});

test("the Buzz Term prompt names the chosen agent and the selection", () => {
  const prompt = buildProjectBuzzTermPrompt(
    {
      projectName: "claimminer",
      repositoryName: "desktop",
      openClawPath: "Hula/projects/claimminer",
      branch: "main",
      view: "Tasks",
      selection: [{ id: "task-1", kind: "task", title: "Fix the panel" }],
    },
    { name: "Ada", pubkey: "abc123" },
  );
  assert.match(prompt, /Fix the panel/);
  assert.match(prompt, /"Ada"/);
  assert.match(prompt, /abc123/);
});
