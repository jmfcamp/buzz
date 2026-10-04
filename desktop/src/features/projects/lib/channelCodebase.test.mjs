import assert from "node:assert/strict";
import test from "node:test";

import {
  CODEBASE_ORIGIN_ARGV,
  codebaseOriginFromRemote,
  githubOriginFromRemote,
  loadedDefaultBranch,
  projectChannelPrimaryRepository,
  projectChannelSubRepositories,
  resolveCodebaseOrigin,
  storedRepositoryRemotes,
} from "./channelCodebase.ts";

const HOME = "11111111-1111-4111-8111-111111111111";
const NESTED = "22222222-2222-4222-8222-222222222222";

function repo(overrides) {
  return {
    id: overrides.dtag,
    name: overrides.dtag,
    repoAddress: `30617:owner:${overrides.dtag}`,
    channelId: null,
    hulaPath: null,
    eventTags: [["d", overrides.dtag]],
    ...overrides,
  };
}

test("origin argv only reads the origin remote", () => {
  assert.deepEqual(CODEBASE_ORIGIN_ARGV, [
    "git",
    "remote",
    "get-url",
    "origin",
  ]);
});

test("the project root path is the channel codebase, not a nested repo", () => {
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
  const project = {
    dtag: "products_hulabill",
    hulaPath: "Hula/projects/products_hulabill",
    projectChannelId: HOME,
    primaryRepositoryAddress: primary.repoAddress,
    repositories: [nested, primary],
  };
  assert.equal(
    projectChannelPrimaryRepository(project)?.dtag,
    "products_hulabill",
  );
  assert.deepEqual(
    projectChannelSubRepositories(project).map((repository) => repository.dtag),
    ["hulabill-acs-services"],
  );
  assert.equal(project.repositories.length, 2);
});

test("a shared home channel still keeps the marked primary repo", () => {
  const primary = repo({ dtag: "buzz", channelId: HOME });
  const other = repo({ dtag: "relay-tools", channelId: HOME });
  const project = {
    dtag: "buzz",
    hulaPath: null,
    projectChannelId: HOME,
    primaryRepositoryAddress: primary.repoAddress,
    repositories: [other, primary],
  };
  assert.equal(projectChannelPrimaryRepository(project)?.dtag, "buzz");
  assert.deepEqual(
    projectChannelSubRepositories(project).map((repository) => repository.dtag),
    ["relay-tools"],
  );
});

test("the only home-channel repo is primary even when its d tag differs", () => {
  const primary = repo({ dtag: "services", channelId: HOME });
  const project = {
    dtag: "hulabill",
    hulaPath: null,
    projectChannelId: HOME,
    primaryRepositoryAddress: null,
    repositories: [primary],
  };
  assert.equal(projectChannelPrimaryRepository(project)?.id, primary.id);
  assert.deepEqual(projectChannelSubRepositories(project), []);
});

test("github remotes become owner/repo links and drop credentials", () => {
  assert.deepEqual(
    githubOriginFromRemote("https://github.com/jmfcamp/hulabill.git"),
    {
      owner: "jmfcamp",
      repo: "hulabill",
      url: "https://github.com/jmfcamp/hulabill",
    },
  );
  assert.deepEqual(
    githubOriginFromRemote("git@github.com:jmfcamp/hulabill.git"),
    {
      owner: "jmfcamp",
      repo: "hulabill",
      url: "https://github.com/jmfcamp/hulabill",
    },
  );
  assert.equal(
    githubOriginFromRemote(
      "https://token:secret@github.com/jmfcamp/hulabill.git",
    )?.url,
    "https://github.com/jmfcamp/hulabill",
  );
  assert.equal(
    githubOriginFromRemote("https://gitlab.com/jmfcamp/hulabill.git"),
    null,
  );
  assert.equal(githubOriginFromRemote("https://github.com/only-owner"), null);
});

test("a non-github origin is linked as itself and a missing origin is unset", () => {
  assert.deepEqual(
    codebaseOriginFromRemote("https://git.example.com/team/app.git"),
    {
      kind: "link",
      label: "git.example.com/team/app",
      url: "https://git.example.com/team/app.git",
    },
  );
  assert.deepEqual(codebaseOriginFromRemote(""), { kind: "unset" });
  assert.equal(resolveCodebaseOrigin(null, []).kind, "unset");
  assert.equal(
    resolveCodebaseOrigin("git@github.com:acme/api.git", [
      "https://example.com/not-this.git",
    ]).url,
    "https://github.com/acme/api",
  );
});

test("stored tags are used only when origin was not read", () => {
  const repository = repo({
    dtag: "products_hulabill",
    eventTags: [
      ["d", "products_hulabill"],
      ["clone", "https://github.com/acme/hulabill.git"],
      ["web", "https://github.com/acme/hulabill"],
    ],
    cloneUrls: ["https://relay.example/git/aa/products_hulabill"],
  });
  assert.deepEqual(storedRepositoryRemotes(repository), [
    "https://github.com/acme/hulabill.git",
    "https://github.com/acme/hulabill",
  ]);
  assert.equal(
    resolveCodebaseOrigin(null, storedRepositoryRemotes(repository)).url,
    "https://github.com/acme/hulabill",
  );
  assert.equal(
    resolveCodebaseOrigin("", storedRepositoryRemotes(repository)).url,
    "https://github.com/acme/hulabill",
  );
});

test("an empty tag list does not invent an origin from synthesized clone URLs", () => {
  const repository = repo({
    dtag: "products_hulabill",
    eventTags: [
      ["d", "products_hulabill"],
      ["name", "products_hulabill"],
    ],
    cloneUrls: ["https://relay.example/git/aa/products_hulabill"],
  });
  assert.deepEqual(storedRepositoryRemotes(repository), []);
  assert.equal(resolveCodebaseOrigin(null, []).kind, "unset");
});

test("default branch is shown only when the announcement stored it", () => {
  assert.equal(
    loadedDefaultBranch({
      eventTags: [["default-branch", "develop"]],
    }),
    "develop",
  );
  assert.equal(
    loadedDefaultBranch({
      eventTags: [["name", "products_hulabill"]],
      defaultBranch: "main",
    }),
    null,
  );
});
