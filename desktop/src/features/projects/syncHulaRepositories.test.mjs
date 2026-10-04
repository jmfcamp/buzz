import assert from "node:assert/strict";
import test from "node:test";

import { buildHulaProjectRecords } from "./lib/hulaProjectRecords.ts";
import {
  publishProjectCodingAgent,
  publishProjectDri,
  syncMissingHulaRepositories,
} from "./syncHulaRepositories.ts";
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
    driPubkey: "c".repeat(64),
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
    fetchOwnHead: async (kind) =>
      kind === KIND_PROJECT_ANNOUNCEMENT ? head : null,
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
      assert.equal(event.tags.find((tag) => tag[0] === "name")?.[1], "desktop");
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

test("an existing repository named after the project is renamed to the workspace directory", async () => {
  const root = "Hula/projects/HulaBill";
  let projectPublished = false;
  const published = [];
  const project = {
    ...hulaProject(),
    dtag: "products-hulabill",
    name: "products_hulabill",
    hulaPath: root,
    id: `${KIND_PROJECT_ANNOUNCEMENT}:${OWNER}:products-hulabill`,
    projectAddress: `${KIND_PROJECT_ANNOUNCEMENT}:${OWNER}:products-hulabill`,
    primaryRepositoryAddress: `${KIND_REPO_ANNOUNCEMENT}:${OWNER}:products-hulabill`,
    repositoryAddresses: [
      `${KIND_REPO_ANNOUNCEMENT}:${OWNER}:products-hulabill`,
    ],
    repositories: [
      {
        id: `${OWNER}:products-hulabill`,
        dtag: "products-hulabill",
        name: "products_hulabill",
        hulaPath: root,
        repoAddress: `${KIND_REPO_ANNOUNCEMENT}:${OWNER}:products-hulabill`,
      },
    ],
  };
  const count = await syncMissingHulaRepositories(project, {
    listGitRepositories: async () => [root],
    fetchOwnHead: async (kind, _owner, dtag) => {
      if (kind !== KIND_REPO_ANNOUNCEMENT) return null;
      return {
        id: "repo-head",
        pubkey: OWNER,
        created_at: 3,
        kind,
        content: "",
        sig: "sig",
        tags: [
          ["d", dtag],
          ["name", "products_hulabill"],
          ["buzz-channel", HOME],
          ["buzz-hula-path", root],
          ["clone", "https://github.com/jmfcamp/HulaBill.git"],
        ],
      };
    },
    signRelayEvent: async (template) => ({
      id: "signed",
      pubkey: OWNER,
      created_at: 6,
      kind: template.kind,
      content: template.content,
      tags: template.tags,
      sig: "sig",
    }),
    publishRepositoryEvent: async (event) => {
      published.push(event);
    },
    publishProjectEvent: async () => {
      projectPublished = true;
    },
  });
  assert.equal(count, 1);
  assert.equal(projectPublished, false);
  assert.equal(published.length, 1);
  assert.equal(
    published[0].tags.find((tag) => tag[0] === "d")?.[1],
    "products-hulabill",
  );
  assert.equal(
    published[0].tags.find((tag) => tag[0] === "name")?.[1],
    "HulaBill",
  );
  assert.equal(
    published[0].tags.find((tag) => tag[0] === "clone")?.[1],
    "https://github.com/jmfcamp/HulaBill.git",
  );
  assert.equal(
    published[0].tags.find((tag) => tag[0] === "buzz-hula-path")?.[1],
    root,
  );
});

test("a repository whose live name already matches the directory is not republished", async () => {
  let published = false;
  const count = await syncMissingHulaRepositories(hulaProject(), {
    listGitRepositories: async () => [ROOT],
    fetchOwnHead: async () => {
      throw new Error(
        "live head should not be read when the name already matches",
      );
    },
    publishRepositoryEvent: async () => {
      published = true;
    },
    publishProjectEvent: async () => {
      published = true;
    },
  });
  assert.equal(count, 0);
  assert.equal(published, false);
});

test("a missing DRI is republished as the logged-in project owner", async () => {
  let projectTags = null;
  const count = await syncMissingHulaRepositories(hulaProject(), {
    listGitRepositories: async () => [ROOT],
    getIdentity: async () => ({ pubkey: OWNER }),
    fetchOwnHead: async (kind) => {
      if (kind !== KIND_PROJECT_ANNOUNCEMENT) return null;
      return {
        id: "project-head",
        pubkey: OWNER,
        created_at: 4,
        kind,
        content: "",
        sig: "sig",
        tags: [
          ["d", "claimminer"],
          ["name", "claimminer"],
          ["buzz-channel", HOME],
          ["buzz-hula-path", ROOT],
          ["a", `${KIND_REPO_ANNOUNCEMENT}:${OWNER}:claimminer`],
        ],
      };
    },
    signRelayEvent: async (template) => ({
      id: "signed",
      pubkey: OWNER,
      created_at: 5,
      kind: template.kind,
      content: template.content,
      tags: template.tags,
      sig: "sig",
    }),
    publishProjectEvent: async (event) => {
      projectTags = event.tags;
    },
    publishRepositoryEvent: async () => {
      throw new Error("repository announcements stay put");
    },
  });
  assert.equal(count, 1);
  assert.equal(projectTags.find((tag) => tag[0] === "dri")?.[1], OWNER);
});

test("setting a DRI replaces the tag with the chosen member", async () => {
  const chosen = "d".repeat(64);
  let projectTags = null;
  const saved = await publishProjectDri(hulaProject(), chosen, {
    getIdentity: async () => ({ pubkey: OWNER }),
    fetchOwnHead: async () => ({
      id: "project-head",
      pubkey: OWNER,
      created_at: 4,
      kind: KIND_PROJECT_ANNOUNCEMENT,
      content: "",
      sig: "sig",
      tags: [
        ["d", "claimminer"],
        ["name", "claimminer"],
        ["buzz-channel", HOME],
        ["dri", OWNER],
        ["a", `${KIND_REPO_ANNOUNCEMENT}:${OWNER}:claimminer`],
      ],
    }),
    signRelayEvent: async (template) => ({
      id: "signed",
      pubkey: OWNER,
      created_at: 6,
      kind: template.kind,
      content: template.content,
      tags: template.tags,
      sig: "sig",
    }),
    publishProjectEvent: async (event) => {
      projectTags = event.tags;
    },
  });
  assert.equal(saved, chosen);
  assert.deepEqual(
    projectTags.filter((tag) => tag[0] === "dri"),
    [["dri", chosen]],
  );
});

test("changing the DRI leaves the coding agent tag in place", async () => {
  const chosen = "d".repeat(64);
  const codingAgent = "e".repeat(64);
  let projectTags = null;
  await publishProjectDri(hulaProject(), chosen, {
    getIdentity: async () => ({ pubkey: OWNER }),
    fetchOwnHead: async () => ({
      id: "project-head",
      pubkey: OWNER,
      created_at: 4,
      kind: KIND_PROJECT_ANNOUNCEMENT,
      content: "",
      sig: "sig",
      tags: [
        ["d", "claimminer"],
        ["name", "claimminer"],
        ["buzz-channel", HOME],
        ["dri", OWNER],
        ["coding-agent", codingAgent],
        ["a", `${KIND_REPO_ANNOUNCEMENT}:${OWNER}:claimminer`],
      ],
    }),
    signRelayEvent: async (template) => ({
      id: "signed",
      pubkey: OWNER,
      created_at: 6,
      kind: template.kind,
      content: template.content,
      tags: template.tags,
      sig: "sig",
    }),
    publishProjectEvent: async (event) => {
      projectTags = event.tags;
    },
  });
  assert.deepEqual(
    projectTags.filter((tag) => tag[0] === "dri"),
    [["dri", chosen]],
  );
  assert.deepEqual(
    projectTags.filter((tag) => tag[0] === "coding-agent"),
    [["coding-agent", codingAgent]],
  );
});

test("changing the coding agent leaves the DRI tag in place", async () => {
  const chosen = "d".repeat(64);
  const dri = "c".repeat(64);
  let ensured = null;
  let projectTags = null;
  const saved = await publishProjectCodingAgent(hulaProject(), chosen, {
    getIdentity: async () => ({ pubkey: OWNER }),
    ensureChannelMember: async (channelId, pubkey) => {
      ensured = { channelId, pubkey };
      return pubkey;
    },
    fetchOwnHead: async () => ({
      id: "project-head",
      pubkey: OWNER,
      created_at: 4,
      kind: KIND_PROJECT_ANNOUNCEMENT,
      content: "",
      sig: "sig",
      tags: [
        ["d", "claimminer"],
        ["name", "claimminer"],
        ["buzz-channel", HOME],
        ["dri", dri],
        ["a", `${KIND_REPO_ANNOUNCEMENT}:${OWNER}:claimminer`],
      ],
    }),
    signRelayEvent: async (template) => ({
      id: "signed",
      pubkey: OWNER,
      created_at: 7,
      kind: template.kind,
      content: template.content,
      tags: template.tags,
      sig: "sig",
    }),
    publishProjectEvent: async (event) => {
      projectTags = event.tags;
    },
  });
  assert.equal(saved, chosen);
  assert.deepEqual(ensured, { channelId: HOME, pubkey: chosen });
  assert.deepEqual(
    projectTags.filter((tag) => tag[0] === "dri"),
    [["dri", dri]],
  );
  assert.deepEqual(
    projectTags.filter((tag) => tag[0] === "coding-agent"),
    [["coding-agent", chosen]],
  );
});
