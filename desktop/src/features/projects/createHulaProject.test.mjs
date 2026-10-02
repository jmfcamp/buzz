import assert from "node:assert/strict";
import test from "node:test";

import { createProject } from "./createProject.ts";
import { planHulaChannels } from "./lib/hulaProjectPlan.ts";
import {
  KIND_PROJECT_ANNOUNCEMENT,
  KIND_REPO_ANNOUNCEMENT,
} from "../../shared/constants/kinds.ts";

const OWNER = "a".repeat(64);
const HOME = "11111111-1111-4111-8111-111111111111";
const DESKTOP = "22222222-2222-4222-8222-222222222222";
const ROOT = "Hula/projects/claimminer";

function channel(id, name, extras = {}) {
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
    ...extras,
  };
}

function harness(directory = []) {
  const order = [];
  const created = [];
  const joined = [];
  const heads = new Map();
  let nextId = 0;
  const deps = {
    getIdentity: async () => ({ pubkey: OWNER }),
    fetchProjects: async () => [],
    getOpenChannelDirectory: async () => directory,
    createChannel: async (input) => {
      created.push(input);
      const id = created.length === 1 ? HOME : DESKTOP;
      return channel(id, input.name, {
        description: input.description ?? "",
        isMember: true,
        visibility: input.visibility,
      });
    },
    joinChannel: async (id) => {
      joined.push(id);
    },
    fetchOwnHead: async (kind, _owner, dtag) =>
      heads.get(`${kind}:${dtag}`) ?? null,
    signRelayEvent: async (template) => ({
      id: `event-${nextId++}`,
      pubkey: OWNER,
      created_at: 10,
      kind: template.kind,
      tags: template.tags,
      content: template.content,
      sig: "sig",
    }),
    publishRepositoryEvent: async (event) => {
      order.push("repo");
      const dtag = event.tags.find((tag) => tag[0] === "d")?.[1];
      heads.set(`${event.kind}:${dtag}`, event);
    },
    publishProjectEvent: async (event) => {
      order.push("project");
      const dtag = event.tags.find((tag) => tag[0] === "d")?.[1];
      heads.set(`${event.kind}:${dtag}`, event);
    },
    finishCreate: async (home, project, _input, resume, projectId) => {
      resume.projectIds.delete(projectId);
      resume.channels.delete(projectId);
      return { channel: home, project };
    },
    relayOrigin: () => null,
  };
  return { created, deps, heads, joined, order };
}

function input() {
  return {
    name: "claimminer",
    description: "Claims",
    hula: {
      hulaPath: ROOT,
      repoPaths: [ROOT, `${ROOT}/desktop`],
    },
  };
}

test("a Hula project publishes path records and one project, with no clone URL", async () => {
  const { created, deps, order } = harness();
  const resume = { channels: new Map(), projectIds: new Set() };
  const result = await createProject(input(), resume, deps);

  assert.deepEqual(
    created.map((row) => row.name),
    ["claimminer", "claimminer_desktop"],
  );
  assert.equal(created[0].description, "Claims");
  assert.equal(created[1].description, undefined);
  assert.equal(created[0].channelType, "stream");
  assert.deepEqual(order, ["repo", "repo", "project"]);
  assert.equal(result.project.hulaPath, ROOT);
  assert.equal(
    result.project.repositories.some((repository) =>
      repository.cloneUrls.some((url) => url.includes("/git/")),
    ),
    false,
  );
  assert.deepEqual(
    result.project.repositories.map((repository) => repository.hulaPath),
    [ROOT, `${ROOT}/desktop`],
  );
  assert.deepEqual(result.project.relatedChannelIds, [DESKTOP]);
  assert.equal(result.channel?.id, HOME);
});

test("a retry reuses the channels and repository heads", async () => {
  const { created, deps, order } = harness();
  const resume = { channels: new Map(), projectIds: new Set() };
  await createProject(input(), resume, deps);
  resume.projectIds.add(`${OWNER}:claimminer`);
  await createProject(input(), resume, deps);
  assert.equal(created.length, 2);
  assert.deepEqual(order, ["repo", "repo", "project"]);
});

test("an existing project with the same name is not given a path", async () => {
  const { deps, order } = harness();
  deps.fetchProjects = async () => [
    {
      owner: OWNER,
      dtag: "claimminer",
      name: "claimminer",
      legacy: false,
    },
  ];
  await assert.rejects(
    () =>
      createProject(input(), { channels: new Map(), projectIds: new Set() }, deps),
    /already have a project named "claimminer"/,
  );
  assert.deepEqual(order, []);
});

test("a saved channel plan joins the existing channel instead of creating another", async () => {
  const existing = channel(HOME, "claimminer", { isMember: false });
  const { created, deps, joined } = harness([existing]);
  const plan = planHulaChannels({
    projectName: "claimminer",
    rootPath: ROOT,
    repoPaths: [ROOT],
    takenChannelNames: [],
  });
  const resume = {
    channels: new Map(),
    projectIds: new Set(),
    hulaPlans: new Map([[`${OWNER}:claimminer`, plan]]),
  };
  await createProject(
    { name: "claimminer", hula: { hulaPath: ROOT, repoPaths: [ROOT] } },
    resume,
    deps,
  );
  assert.deepEqual(created, []);
  assert.deepEqual(joined, [HOME]);
});

test("a published head for a different path is left alone", async () => {
  const { deps } = harness();
  deps.fetchOwnHead = async (kind) => {
    if (kind !== KIND_PROJECT_ANNOUNCEMENT) return null;
    return {
      id: "head",
      pubkey: OWNER,
      created_at: 1,
      kind: KIND_PROJECT_ANNOUNCEMENT,
      content: "",
      sig: "sig",
      tags: [
        ["d", "claimminer"],
        ["name", "claimminer"],
        ["buzz-channel", HOME],
        ["buzz-hula-path", "Hula/projects/other"],
        ["a", `${KIND_REPO_ANNOUNCEMENT}:${OWNER}:claimminer`],
      ],
    };
  };
  await assert.rejects(
    () =>
      createProject(
        { name: "claimminer", hula: { hulaPath: ROOT, repoPaths: [ROOT] } },
        { channels: new Map(), projectIds: new Set() },
        deps,
      ),
    /already have a project named "claimminer"/,
  );
});
