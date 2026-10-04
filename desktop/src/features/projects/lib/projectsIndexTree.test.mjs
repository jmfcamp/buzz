import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildProjectsIndexTree,
  groupProjectsIndexTasks,
  projectDriPubkey,
  projectsIndexChannelMemberPubkeys,
} from "./projectsIndexTree.ts";

const HOME = "11111111-1111-4111-8111-111111111111";
const NESTED = "22222222-2222-4222-8222-222222222222";

function repo(overrides) {
  return {
    id: overrides.dtag,
    name: overrides.dtag,
    description: "",
    repoAddress: `30617:owner:${overrides.dtag}`,
    channelId: null,
    hulaPath: null,
    createdAt: 1,
    ...overrides,
  };
}

function project(overrides) {
  return {
    id: `30621:owner:${overrides.dtag}`,
    dtag: overrides.dtag,
    name: overrides.dtag,
    description: "",
    hulaPath: null,
    projectChannelId: null,
    primaryRepositoryAddress: null,
    relatedChannelIds: [],
    repositories: [],
    ...overrides,
  };
}

test("repositories nest mainline then its subrepository", () => {
  const primary = repo({
    dtag: "products_hulabill",
    channelId: HOME,
    hulaPath: "Hula/projects/products_hulabill",
    createdAt: 2,
  });
  const nested = repo({
    dtag: "hulabill-acs-services",
    channelId: NESTED,
    hulaPath: "Hula/projects/products_hulabill/hulabill-acs-services",
    createdAt: 3,
  });
  const hulabill = project({
    dtag: "products_hulabill",
    hulaPath: "Hula/projects/products_hulabill",
    projectChannelId: HOME,
    primaryRepositoryAddress: primary.repoAddress,
    repositories: [nested, primary],
  });

  const [node] = buildProjectsIndexTree({
    channelsById: new Map(),
    issues: [],
    projects: [hulabill],
    searchQuery: "",
    sort: "name",
  });

  assert.deepEqual(
    node.repositories.map((item) => [
      item.row.repository.dtag,
      item.role.kind,
      item.nested,
    ]),
    [
      ["products_hulabill", "mainline", false],
      ["hulabill-acs-services", "subrepository", true],
    ],
  );
  assert.deepEqual(
    node.channels.map((row) => row.channelId),
    [HOME, NESTED],
  );
});

test("search keeps a matching task under its project and drops the rest", () => {
  const alpha = project({ dtag: "alpha" });
  const betaRepo = repo({ dtag: "beta-repo" });
  const beta = project({
    dtag: "beta",
    repositories: [betaRepo],
  });
  const issue = {
    id: "issue-1",
    title: "Fix the bill parser",
    content: "",
    status: "Open",
    createdAt: 2,
    updatedAt: 3,
  };

  const nodes = buildProjectsIndexTree({
    channelsById: new Map(),
    issues: [
      {
        issue,
        project: beta,
        repository: betaRepo,
      },
    ],
    projects: [alpha, beta],
    searchQuery: "parser",
    sort: "updated",
  });

  assert.deepEqual(
    nodes.map((node) => node.project.dtag),
    ["beta"],
  );
  assert.equal(nodes[0].issues.length, 1);
  assert.equal(nodes[0].issues[0].issue.title, "Fix the bill parser");
  assert.equal(nodes[0].repositories.length, 0);
});

test("a subrepository search keeps its mainline parent", () => {
  const primary = repo({
    dtag: "products_hulabill",
    name: "products_hulabill",
    hulaPath: "Hula/projects/products_hulabill",
  });
  const nested = repo({
    dtag: "hulabill-acs-services",
    name: "acs-services",
    hulaPath: "Hula/projects/products_hulabill/hulabill-acs-services",
  });
  const hulabill = project({
    dtag: "products_hulabill",
    hulaPath: "Hula/projects/products_hulabill",
    primaryRepositoryAddress: primary.repoAddress,
    repositories: [primary, nested],
  });

  const [node] = buildProjectsIndexTree({
    channelsById: new Map(),
    issues: [],
    projects: [hulabill],
    searchQuery: "acs-services",
    sort: "name",
  });

  assert.deepEqual(
    node.repositories.map((item) => item.row.repository.dtag),
    ["products_hulabill", "hulabill-acs-services"],
  );
  assert.equal(node.repositories[1].nested, true);
});

test("tasks group into queued, in progress, and done, hiding empty groups", () => {
  const repoRow = repo({ dtag: "beta-repo" });
  const beta = project({ dtag: "beta", repositories: [repoRow] });
  function item(id, status) {
    return {
      issue: { id, title: id, content: "", status, createdAt: 1, updatedAt: 1 },
      project: beta,
      repository: repoRow,
    };
  }

  const groups = groupProjectsIndexTasks([
    item("doing", "In Progress"),
    item("later", "Backlog"),
    item("finished", "Done"),
    item("open", "Open"),
  ]);

  assert.deepEqual(
    groups.map((group) => [
      group.word,
      group.items.map((item) => item.issue.id),
    ]),
    [
      ["queued", ["later", "open"]],
      ["in progress", ["doing"]],
      ["done", ["finished"]],
    ],
  );
  assert.deepEqual(
    groupProjectsIndexTasks([item("only-done", "Closed")]).map(
      (group) => group.word,
    ),
    ["done"],
  );
});

test("channel member pubkeys come from the list already loaded", () => {
  assert.deepEqual(
    projectsIndexChannelMemberPubkeys({
      id: "c",
      memberPubkeys: ["member"],
      participantPubkeys: ["participant"],
    }),
    ["member"],
  );
  assert.deepEqual(
    projectsIndexChannelMemberPubkeys({
      id: "c",
      participantPubkeys: ["participant"],
    }),
    ["participant"],
  );
  assert.deepEqual(
    projectsIndexChannelMemberPubkeys({ id: "c", participants: ["person"] }),
    ["person"],
  );
  assert.equal(projectsIndexChannelMemberPubkeys({ id: "c" }), null);
  assert.equal(projectsIndexChannelMemberPubkeys(undefined), null);
});

test("DRI pubkey is read only when the project stores one", () => {
  const pubkey = "a".repeat(64);
  assert.equal(projectDriPubkey({}), null);
  assert.equal(projectDriPubkey({ dri: "not-a-key" }), null);
  assert.equal(projectDriPubkey({ dri: pubkey }), pubkey);
  assert.equal(projectDriPubkey({ driPubkey: pubkey }), pubkey);
  assert.equal(projectDriPubkey({ tags: [["buzz-dri", pubkey]] }), pubkey);
  assert.equal(
    projectDriPubkey({ dri: pubkey, tags: [["dri", "b".repeat(64)]] }),
    pubkey,
  );
});
