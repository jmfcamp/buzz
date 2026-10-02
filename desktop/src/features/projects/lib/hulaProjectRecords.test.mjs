import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectReadModels } from "../projectModels.ts";
import { validateProjectEventEnvelope } from "../projectModels.ts";
import { buildHulaProjectRecords } from "./hulaProjectRecords.ts";

const OWNER = "a".repeat(64);
const HOME = "11111111-1111-4111-8111-111111111111";
const DESKTOP = "22222222-2222-4222-8222-222222222222";

test("a Hula project stores a path on each repo and does not add a clone URL", () => {
  const records = buildHulaProjectRecords({
    description: "Claims",
    homeChannelId: HOME,
    name: "claimminer",
    ownerPubkey: OWNER,
    repos: [
      {
        subPath: "",
        hulaPath: "Hula/projects/claimminer",
        channelName: "claimminer",
        channelId: HOME,
        dtag: "claimminer",
      },
      {
        subPath: "desktop",
        hulaPath: "Hula/projects/claimminer/desktop",
        channelName: "claimminer_desktop",
        channelId: DESKTOP,
        dtag: "claimminer-desktop",
      },
    ],
  });

  assert.equal(
    records.repositories.some((repo) =>
      repo.event.tags.some((tag) => tag[0] === "clone"),
    ),
    false,
  );
  assert.deepEqual(
    records.repositories.map((repo) => [
      repo.dtag,
      repo.event.tags.find((tag) => tag[0] === "buzz-channel")?.[1],
      repo.event.tags.find((tag) => tag[0] === "buzz-hula-path")?.[1],
    ]),
    [
      ["claimminer", HOME, "Hula/projects/claimminer"],
      ["claimminer-desktop", DESKTOP, "Hula/projects/claimminer/desktop"],
    ],
  );
  assert.ok(
    records.project.tags.some(
      (tag) => tag[0] === "buzz-hula-path" && tag[1] === "Hula/projects/claimminer",
    ),
  );
  assert.deepEqual(
    records.project.tags.filter((tag) => tag[0] === "buzz-related-channel"),
    [["buzz-related-channel", DESKTOP]],
  );
  assert.deepEqual(
    records.project.tags.filter((tag) => tag[0] === "a").map((tag) => tag[1]),
    [
      `30617:${OWNER}:claimminer`,
      `30617:${OWNER}:claimminer-desktop`,
    ].sort(),
  );

  const [project] = buildProjectReadModels({
    projectEvents: [
      {
        id: "project",
        kind: 30621,
        pubkey: OWNER,
        created_at: 10,
        content: "",
        tags: records.project.tags,
      },
    ],
    repositoryEvents: records.repositories.map((repo) => ({
      id: repo.dtag,
      kind: 30617,
      pubkey: OWNER,
      created_at: 9,
      content: "",
      tags: repo.event.tags,
    })),
  });
  assert.equal(project.hulaPath, "Hula/projects/claimminer");
  assert.equal(
    project.repositories.find((repo) => repo.dtag === "claimminer-desktop")
      ?.hulaPath,
    "Hula/projects/claimminer/desktop",
  );
  assert.deepEqual(project.relatedChannelIds, [DESKTOP]);
});

test("two Hula paths on one project are refused", () => {
  assert.throws(
    () =>
      validateProjectEventEnvelope(
        [
          ["d", "claimminer"],
          ["name", "claimminer"],
          ["buzz-hula-path", "Hula/projects/claimminer"],
          ["buzz-hula-path", "Hula/projects/other"],
        ],
        "",
      ),
    /buzz-hula-path/,
  );
});
