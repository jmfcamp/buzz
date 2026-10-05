import assert from "node:assert/strict";
import test from "node:test";

import { findSubrepositoryChannelBinding } from "./subrepositoryChannel.ts";

function project(overrides = {}) {
  return {
    id: "project-home",
    dtag: "hulabill",
    createdAt: 10,
    legacy: false,
    visibility: "listed",
    hulaPath: null,
    projectChannelId: "home-channel",
    primaryRepositoryAddress: "30617:owner:hulabill",
    relatedChannelIds: ["acs-channel"],
    repositories: [
      {
        id: "owner:hulabill",
        dtag: "hulabill",
        name: "Hulabill",
        repoAddress: "30617:owner:hulabill",
        channelId: "home-channel",
      },
      {
        id: "owner:acs",
        dtag: "hulabill-acs-services",
        name: "ACS",
        repoAddress: "30617:owner:acs",
        channelId: "acs-channel",
      },
    ],
    ...overrides,
  };
}

test("findSubrepositoryChannelBinding returns the member repo for its buzz-channel", () => {
  const selected = findSubrepositoryChannelBinding("acs-channel", [project()]);
  assert.equal(selected?.project.id, "project-home");
  assert.equal(selected?.repository.id, "owner:acs");
});

test("findSubrepositoryChannelBinding ignores the project home channel", () => {
  const homeTaggedSubrepo = project({
    repositories: [
      {
        id: "owner:hulabill",
        dtag: "hulabill",
        name: "Hulabill",
        repoAddress: "30617:owner:hulabill",
        channelId: "home-channel",
      },
      {
        id: "owner:acs",
        dtag: "hulabill-acs-services",
        name: "ACS",
        repoAddress: "30617:owner:acs",
        channelId: "home-channel",
      },
    ],
  });
  assert.equal(
    findSubrepositoryChannelBinding("home-channel", [homeTaggedSubrepo]),
    null,
  );
});

test("findSubrepositoryChannelBinding ignores the primary repository channel", () => {
  const selected = findSubrepositoryChannelBinding("primary-channel", [
    project({
      projectChannelId: "home-channel",
      repositories: [
        {
          id: "owner:hulabill",
          dtag: "hulabill",
          name: "Hulabill",
          repoAddress: "30617:owner:hulabill",
          channelId: "primary-channel",
        },
        {
          id: "owner:acs",
          dtag: "hulabill-acs-services",
          name: "ACS",
          repoAddress: "30617:owner:acs",
          channelId: "acs-channel",
        },
      ],
    }),
  ]);
  assert.equal(selected, null);
});

test("findSubrepositoryChannelBinding leaves ordinary and unbound related channels alone", () => {
  assert.equal(findSubrepositoryChannelBinding("lounge", [project()]), null);
  assert.equal(
    findSubrepositoryChannelBinding("notes", [
      project({ relatedChannelIds: ["notes", "acs-channel"] }),
    ]),
    null,
  );
  assert.equal(findSubrepositoryChannelBinding(null, [project()]), null);
});

test("findSubrepositoryChannelBinding ignores legacy projects and unlabeled membership", () => {
  assert.equal(
    findSubrepositoryChannelBinding("acs-channel", [
      project({ legacy: true }),
      project({
        id: "unlabeled",
        primaryRepositoryAddress: null,
        projectChannelId: "somewhere-else",
        repositories: [
          {
            id: "owner:acs",
            dtag: "hulabill-acs-services",
            name: "ACS",
            repoAddress: "30617:owner:acs",
            channelId: "acs-channel",
          },
        ],
      }),
    ]),
    null,
  );
});

test("findSubrepositoryChannelBinding prefers the oldest listed project", () => {
  const selected = findSubrepositoryChannelBinding("acs-channel", [
    project({ id: "later", createdAt: 50 }),
    project({ id: "hidden", createdAt: 5, visibility: "unlisted" }),
    project({ id: "original", createdAt: 20 }),
  ]);
  assert.equal(selected?.project.id, "original");
});

test("findSubrepositoryChannelBinding falls back to an unlisted project", () => {
  const selected = findSubrepositoryChannelBinding("acs-channel", [
    project({ id: "hidden", visibility: "unlisted" }),
  ]);
  assert.equal(selected?.project.id, "hidden");
  assert.equal(selected?.repository.dtag, "hulabill-acs-services");
});
