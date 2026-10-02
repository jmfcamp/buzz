import assert from "node:assert/strict";
import test from "node:test";

import { buildHulaProjectRecords } from "./lib/hulaProjectRecords.ts";
import { syncMissingHulaRepositories } from "./syncHulaRepositories.ts";
import {
  KIND_PROJECT_ANNOUNCEMENT,
  KIND_REPO_ANNOUNCEMENT,
} from "../../shared/constants/kinds.ts";

const OWNER = "a".repeat(64);
const HOME = "11111111-1111-4111-8111-111111111111";
const DESKTOP = "22222222-2222-4222-8222-222222222222";
const ROOT = "Hula/projects/claimminer";

function channel(id, name) {
  return {
    id,
    name,
    channelType: "stream",
    visibility: "open",
    description: "",
    topic: null,
    purpose: null,
    memberCount: 1,
    memberPubkeys: [],
    lastMessageAt: null,
    archivedAt: null,
    participants: [],
    participantPubkeys: [],
    isMember: true,
    ttlSeconds: null,
    ttlDeadline: null,
  };
}

function hulaProject(relatedChannelIds = []) {
  return {
    id: `${KIND_PROJECT_ANNOUNCEMENT}:${OWNER}:claimminer`,
    dtag: "claimminer",
    name: "claimminer",
    description: "",
    owner: OWNER,
    createdAt: 1,
    projectChannelId: HOME,
    relatedChannelIds,
    status: "active",
    projectAddress: `${KIND_PROJECT_ANNOUNCEMENT}:${OWNER}:claimminer`,
    primaryRepositoryAddress: `${KIND_REPO_ANNOUNCEMENT}:${OWNER}:claimminer`,
    repositoryAddresses: [`${KIND_REPO_ANNOUNCEMENT}:${OWNER}:claimminer`],
    repositories: [
      {
        id: `${OWNER}:claimminer`,
        dtag: "claimminer",
        name: "claimminer",
        hulaPath: ROOT,
        repoAddress: `${KIND_REPO_ANNOUNCEMENT}:${OWNER}:claimminer`,
      },
    ],
    legacy: false,
    hulaPath: ROOT,
  };
}

test("a project with no Hula path does not scan", async () => {
  let scanned = false;
  const count = await syncMissingHulaRepositories(
    { ...hulaProject(), hulaPath: null },
    {
      listGitRepositories: async () => {
        scanned = true;
        return [];
      },
    },
  );
  assert.equal(count, 0);
  assert.equal(scanned, false);
});

test("a new repository is published, then the project is patched once", async () => {
  const records = buildHulaProjectRecords({
    homeChannelId: HOME,
    name: "claimminer",
    ownerPubkey: OWNER,
    repos: [
      {
        subPath: "",
        hulaPath: ROOT,
        channelName: "claimminer",
        channelId: HOME,
        dtag: "claimminer",
      },
    ],
  });
  const head = {
    id: "project-head",
    pubkey: OWNER,
    created_at: 4,
    kind: records.project.kind,
    content: records.project.content,
    tags: records.project.tags,
    sig: "sig",
  };
  const order = [];
  const created = [];
  let patchedTags = null;
  const count = await syncMissingHulaRepositories(hulaProject(), {
    listGitRepositories: async () => [ROOT, `${ROOT}/desktop`],
    getOpenChannelDirectory: async () => [],
    createChannel: async (input) => {
      created.push(input.name);
      return channel(DESKTOP, input.name);
    },
    joinChannel: async () => {},
    fetchOwnHead: async (kind) => (kind === KIND_PROJECT_ANNOUNCEMENT ? head : null),
    signRelayEvent: async (template) => ({
      id: "signed",
      pubkey: OWNER,
      created_at: 5,
      kind: template.kind,
      content: template.content,
      tags: template.tags,
      sig: "sig",
    }),
    publishRepositoryEvent: async (event) => {
      order.push("repo");
      assert.equal(
        event.tags.some((tag) => tag[0] === "clone"),
        false,
      );
      assert.equal(
        event.tags.find((tag) => tag[0] === "name")?.[1],
        "desktop",
      );
    },
    publishProjectEvent: async (event) => {
      order.push("project");
      patchedTags = event.tags;
    },
  });
  assert.equal(count, 1);
  assert.deepEqual(created, ["claimminer_desktop"]);
  assert.deepEqual(order, ["repo", "project"]);
  assert.deepEqual(
    patchedTags.filter((tag) => tag[0] === "a").map((tag) => tag[1]),
    [
      `${KIND_REPO_ANNOUNCEMENT}:${OWNER}:claimminer`,
      `${KIND_REPO_ANNOUNCEMENT}:${OWNER}:claimminer-desktop`,
    ].sort(),
  );
  assert.deepEqual(
    patchedTags.filter((tag) => tag[0] === "buzz-related-channel"),
    [["buzz-related-channel", DESKTOP]],
  );
});

test("too many related channels fails before a repository is published", async () => {
  let published = false;
  await assert.rejects(
    () =>
      syncMissingHulaRepositories(
        hulaProject(Array.from({ length: 256 }, (_, index) => `id-${index}`)),
        {
          listGitRepositories: async () => [ROOT, `${ROOT}/desktop`],
          publishRepositoryEvent: async () => {
            published = true;
          },
          publishProjectEvent: async () => {
            published = true;
          },
        },
      ),
    /at most 256 channels/,
  );
  assert.equal(published, false);
});
