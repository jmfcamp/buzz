import assert from "node:assert/strict";
import test from "node:test";

import { HULA_RESERVED_COMMUNITY_BOT_PUBKEYS } from "../../agents/lib/reservedCommunityMentionRouting.ts";
import {
  codingAgentChoices,
  replaceProjectCodingAgentTag,
  selectProjectCodingAgent,
} from "./projectCodingAgent.ts";

const CODING = "a".repeat(64);
const TEAM = "b".repeat(64);
const PERSON = "c".repeat(64);
const PROVIDER = "d".repeat(64);
const LATER = "e".repeat(64);

function agent(overrides) {
  return {
    avatarUrl: null,
    backend: { type: "local" },
    name: "Coder",
    personaId: "persona-coder",
    pubkey: CODING,
    teamId: null,
    ...overrides,
  };
}

function member(overrides) {
  return {
    joinedAt: "2026-01-01T00:00:00Z",
    pubkey: CODING,
    role: "bot",
    ...overrides,
  };
}

test("the create-time coding agent is the local bot persona without a team", () => {
  const coding = agent({});
  const selected = selectProjectCodingAgent(
    [
      member({ pubkey: PERSON, role: "member" }),
      member({ pubkey: TEAM, role: "bot" }),
      member({}),
    ],
    [
      agent({
        name: "Team mate",
        personaId: "persona-team",
        pubkey: TEAM,
        teamId: "team-1",
      }),
      agent({ backend: { type: "provider" }, pubkey: PROVIDER }),
      coding,
    ],
  );
  assert.equal(selected, coding);
});

test("a project with no coding agent shows nothing", () => {
  assert.equal(selectProjectCodingAgent(undefined, [agent({})]), null);
  assert.equal(selectProjectCodingAgent([member({})], undefined), null);
  assert.equal(
    selectProjectCodingAgent(
      [member({ pubkey: TEAM, role: "bot" })],
      [agent({ pubkey: TEAM, teamId: "team-1" })],
    ),
    null,
  );
  assert.equal(
    selectProjectCodingAgent([member({ role: "member" })], [agent({})]),
    null,
  );
  assert.equal(
    selectProjectCodingAgent([member({})], [agent({ personaId: null })]),
    null,
  );
  assert.equal(
    selectProjectCodingAgent(
      [member({})],
      [agent({ backend: { type: "provider" } })],
    ),
    null,
  );
});

test("the earliest bot join is the coding agent when more than one matches", () => {
  const earlier = agent({ name: "First", pubkey: CODING });
  const later = agent({
    name: "Second",
    personaId: "persona-later",
    pubkey: LATER,
  });
  const selected = selectProjectCodingAgent(
    [
      member({
        joinedAt: "2026-02-01T00:00:00Z",
        pubkey: LATER,
      }),
      member({ joinedAt: "2026-01-01T00:00:00Z", pubkey: CODING }),
    ],
    [later, earlier],
  );
  assert.equal(selected, earlier);
});

const HUMAN = "f".repeat(64);
const COMMUNITY = "9".repeat(64);

test("coding agent choices are local bots and community bots, not people", () => {
  const choices = codingAgentChoices({
    communityBots: [
      { name: "Captain", pubkey: COMMUNITY },
      { name: "Duplicate", pubkey: CODING },
    ],
    isArchived: (pubkey) => pubkey === "8".repeat(64),
    localAgents: [
      agent({ name: "Coder", pubkey: CODING, avatarUrl: "local.png" }),
      agent({
        backend: { type: "provider" },
        name: "Remote",
        pubkey: PROVIDER,
      }),
      agent({ name: "Archived", pubkey: "8".repeat(64) }),
    ],
  });
  const listed = choices.map((choice) => ({
    kind: choice.kind,
    name: choice.name,
    pubkey: choice.pubkey,
  }));
  assert.deepEqual(listed.slice(0, 2), [
    { kind: "local", name: "Coder", pubkey: CODING },
    { kind: "community", name: "Captain", pubkey: COMMUNITY },
  ]);
  assert.equal(
    choices.some((choice) => choice.pubkey === HUMAN),
    false,
  );
  assert.equal(choices[0].avatarUrl, "local.png");
  for (const pubkey of Object.values(HULA_RESERVED_COMMUNITY_BOT_PUBKEYS)) {
    assert.equal(
      choices.some(
        (choice) => choice.kind === "community" && choice.pubkey === pubkey,
      ),
      true,
      pubkey,
    );
  }
});

test("community bots stay listed when the catalog is empty, and people do not", () => {
  const choices = codingAgentChoices({
    communityBots: [],
    localAgents: [agent({ name: "Coder", pubkey: CODING })],
  });
  assert.equal(
    choices.some((choice) => choice.pubkey === CODING && choice.kind === "local"),
    true,
  );
  assert.equal(choices.some((choice) => choice.pubkey === HUMAN), false);
  assert.equal(
    choices.filter((choice) => choice.kind === "community").length,
    Object.keys(HULA_RESERVED_COMMUNITY_BOT_PUBKEYS).length,
  );
});

test("replacing the coding agent keeps the DRI tag", () => {
  const next = replaceProjectCodingAgentTag(
    [
      ["d", "claimminer"],
      ["dri", HUMAN],
      ["coding-agent", CODING],
    ],
    COMMUNITY,
  );
  assert.deepEqual(
    next.filter((tag) => tag[0] === "dri" || tag[0] === "coding-agent"),
    [
      ["dri", HUMAN],
      ["coding-agent", COMMUNITY],
    ],
  );
});
