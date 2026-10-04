import assert from "node:assert/strict";
import test from "node:test";

import {
  nestRepositoryListRows,
  repositoryRowOpenTarget,
  repositoryRowRole,
  repositoryRowRoleLabel,
} from "./repositoryListRoles.ts";

const HOME = "11111111-1111-4111-8111-111111111111";
const NESTED = "22222222-2222-4222-8222-222222222222";

function repo(overrides) {
  return {
    id: overrides.dtag,
    name: overrides.dtag,
    repoAddress: `30617:owner:${overrides.dtag}`,
    channelId: null,
    hulaPath: null,
    ...overrides,
  };
}

function project(overrides) {
  return {
    id: `30621:owner:${overrides.dtag}`,
    dtag: overrides.dtag,
    hulaPath: null,
    projectChannelId: null,
    primaryRepositoryAddress: null,
    repositories: [],
    ...overrides,
  };
}

test("a hula root is mainline and a repo found inside it is its subrepository", () => {
  const primary = repo({
    dtag: "products_hulabill",
    channelId: HOME,
    hulaPath: "Hula/projects/products_hulabill",
  });
  const nested = repo({
    dtag: "hulabill-acs-services",
    channelId: NESTED,
    hulaPath: "Hula/projects/products_hulabill/hulabill-acs-services",
  });
  const hulabill = project({
    dtag: "products_hulabill",
    hulaPath: "Hula/projects/products_hulabill",
    projectChannelId: HOME,
    primaryRepositoryAddress: primary.repoAddress,
    repositories: [nested, primary],
  });
  assert.equal(
    repositoryRowRole({ project: hulabill, repository: primary }).kind,
    "mainline",
  );
  const sub = repositoryRowRole({ project: hulabill, repository: nested });
  assert.equal(sub.kind, "subrepository");
  assert.equal(sub.mainlineAddress, primary.repoAddress);
  assert.equal(repositoryRowRoleLabel(sub), "Subrepository");
});

test("a repo that is its own project's primary is mainline", () => {
  for (const dtag of ["Test", "project-test"]) {
    const repository = repo({ dtag, channelId: HOME });
    const own = project({
      dtag,
      projectChannelId: HOME,
      primaryRepositoryAddress: repository.repoAddress,
      repositories: [repository],
    });
    assert.equal(
      repositoryRowRole({ project: own, repository }).kind,
      "mainline",
    );
    assert.equal(repositoryRowRoleLabel({ kind: "mainline" }), "Mainline");
  }
});

test("rows stay unlabeled when no primary can be resolved", () => {
  const alpha = repo({ dtag: "alpha" });
  const beta = repo({ dtag: "beta" });
  const unknown = project({
    dtag: "unrelated",
    repositories: [alpha, beta],
  });
  assert.deepEqual(
    [alpha, beta].map(
      (repository) => repositoryRowRole({ project: unknown, repository }).kind,
    ),
    ["unlabeled", "unlabeled"],
  );
  assert.equal(repositoryRowRoleLabel({ kind: "unlabeled" }), null);
});

test("subrepositories nest under their mainline without reordering the others", () => {
  const primary = repo({
    dtag: "products_hulabill",
    channelId: HOME,
    hulaPath: "Hula/projects/products_hulabill",
  });
  const nested = repo({
    dtag: "hulabill-acs-services",
    channelId: NESTED,
    hulaPath: "Hula/projects/products_hulabill/hulabill-acs-services",
  });
  const hulabill = project({
    dtag: "products_hulabill",
    hulaPath: "Hula/projects/products_hulabill",
    projectChannelId: HOME,
    primaryRepositoryAddress: primary.repoAddress,
    repositories: [nested, primary],
  });
  const testRepo = repo({ dtag: "Test", channelId: HOME });
  const testProject = project({
    dtag: "Test",
    projectChannelId: HOME,
    primaryRepositoryAddress: testRepo.repoAddress,
    repositories: [testRepo],
  });
  const otherRepo = repo({ dtag: "project-test", channelId: HOME });
  const otherProject = project({
    dtag: "project-test",
    projectChannelId: HOME,
    primaryRepositoryAddress: otherRepo.repoAddress,
    repositories: [otherRepo],
  });
  const rows = nestRepositoryListRows([
    { project: hulabill, repository: nested },
    { project: testProject, repository: testRepo },
    { project: hulabill, repository: primary },
    { project: otherProject, repository: otherRepo },
  ]);
  assert.deepEqual(
    rows.map((item) => [item.row.repository.dtag, item.role.kind, item.nested]),
    [
      ["Test", "mainline", false],
      ["products_hulabill", "mainline", false],
      ["hulabill-acs-services", "subrepository", true],
      ["project-test", "mainline", false],
    ],
  );
});

test("a subrepository whose mainline is filtered out stays unindented", () => {
  const primary = repo({
    dtag: "products_hulabill",
    channelId: HOME,
    hulaPath: "Hula/projects/products_hulabill",
  });
  const nested = repo({
    dtag: "hulabill-acs-services",
    channelId: NESTED,
    hulaPath: "Hula/projects/products_hulabill/hulabill-acs-services",
  });
  const hulabill = project({
    dtag: "products_hulabill",
    hulaPath: "Hula/projects/products_hulabill",
    projectChannelId: HOME,
    primaryRepositoryAddress: primary.repoAddress,
    repositories: [nested, primary],
  });
  const rows = nestRepositoryListRows([
    { project: hulabill, repository: nested },
  ]);
  assert.equal(rows[0].nested, false);
  assert.equal(rows[0].role.kind, "subrepository");
});

test("mainline opens the project home and a subrepository opens its channel", () => {
  const mainline = repositoryRowOpenTarget({
    projectChannelId: HOME,
    projectId: "30621:owner:products_hulabill",
    repositoryChannelId: HOME,
    role: { kind: "mainline" },
  });
  assert.deepEqual(mainline, {
    missingSubchannel: false,
    target: {
      kind: "project-home",
      projectId: "30621:owner:products_hulabill",
    },
  });
  const sub = repositoryRowOpenTarget({
    projectChannelId: HOME,
    projectId: "30621:owner:products_hulabill",
    repositoryChannelId: NESTED,
    role: {
      kind: "subrepository",
      mainlineAddress: "30617:owner:products_hulabill",
      mainlineRepositoryId: "products_hulabill",
    },
  });
  assert.deepEqual(sub.target, {
    kind: "repository-channel",
    channelId: NESTED,
  });
});

test("a subrepository with no channel of its own reports the gap without a fallback", () => {
  const role = {
    kind: "subrepository",
    mainlineAddress: "30617:owner:products_hulabill",
    mainlineRepositoryId: "products_hulabill",
  };
  for (const repositoryChannelId of [null, HOME, "  "]) {
    assert.deepEqual(
      repositoryRowOpenTarget({
        projectChannelId: HOME,
        projectId: "30621:owner:products_hulabill",
        repositoryChannelId,
        role,
      }),
      {
        missingSubchannel: true,
        target: null,
      },
    );
  }
});
