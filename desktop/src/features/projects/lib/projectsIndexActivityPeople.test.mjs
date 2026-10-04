import assert from "node:assert/strict";
import { test } from "node:test";

import { HULA_RESERVED_COMMUNITY_BOT_PUBKEYS } from "../../agents/lib/reservedCommunityMentionRouting.ts";
import {
  ACTIVITY_MEMBER_EVERYONE,
  ACTIVITY_MEMBER_SECTIONS,
  ACTIVITY_SORT_OPTIONS,
  activityAuthorPubkeys,
  activityCommitAuthorNames,
  activityEventMatchesMember,
  activityMemberFromId,
  activityMemberOptions,
  compareActivityCreatedAt,
  latestActivityCommit,
} from "./projectsIndexActivityPeople.ts";

const ADA = "a".repeat(64);
const BOT = "b".repeat(64);
const MEMBER = "c".repeat(64);

function profile(displayName, isAgent = false, ownerPubkey = null) {
  return {
    avatarUrl: null,
    displayName,
    isAgent,
    name: displayName,
    nip05Handle: null,
    ownerPubkey,
  };
}

function labelsIn(options, section) {
  return options
    .filter((option) => option.section === section)
    .map((option) => option.label);
}

test("sort options are newest then oldest", () => {
  assert.deepEqual(
    ACTIVITY_SORT_OPTIONS.map((option) => option.label),
    ["Newest", "Oldest"],
  );
  assert.equal(ACTIVITY_SORT_OPTIONS[0].value, "newest");
  assert.equal(ACTIVITY_SORT_OPTIONS[1].value, "oldest");
  assert.equal(
    compareActivityCreatedAt("newest", { createdAt: 1 }, { createdAt: 2 }),
    1,
  );
  assert.equal(
    compareActivityCreatedAt("oldest", { createdAt: 1 }, { createdAt: 2 }),
    -1,
  );
});

test("authors are event authors, including bots, not assignees", () => {
  const pubkeys = activityAuthorPubkeys({
    issues: [
      {
        issue: {
          author: ADA,
          assignees: [MEMBER],
          comments: [{ author: BOT }],
        },
      },
    ],
    projects: [{ owner: ADA }],
    pullRequests: [
      {
        pullRequest: {
          author: ADA,
          reviewers: [MEMBER],
          comments: [],
          updates: [{ author: BOT }],
        },
      },
    ],
  });
  assert.deepEqual(pubkeys.sort(), [ADA, BOT].sort());
});

test("commit names come from the newest commit only", () => {
  assert.equal(
    latestActivityCommit([
      { timestamp: 2, authorName: "New" },
      { timestamp: 9, authorName: "Newer" },
      { timestamp: 4, authorName: "Mid" },
    ]).authorName,
    "Newer",
  );
  assert.deepEqual(
    activityCommitAuthorNames({
      one: {
        commits: [
          { authorName: "Older", timestamp: 1 },
          { authorName: "Ada", timestamp: 5 },
        ],
      },
      empty: { commits: [] },
    }),
    ["Ada"],
  );
});

test("member options add loaded members and bots, and skip unloaded rosters", () => {
  const withoutRosters = activityMemberOptions({
    authorNames: ["Git Ada"],
    authorPubkeys: [ADA],
    bots: null,
    managedAgents: null,
    members: null,
    profiles: { [ADA]: profile("Ada") },
    relayAgents: null,
  });
  assert.deepEqual(
    withoutRosters.map((option) => [option.section, option.label]),
    [
      ["members", "Ada"],
      ["members", "Git Ada"],
    ],
  );

  const withRosters = activityMemberOptions({
    authorNames: ["Ada"],
    authorPubkeys: [ADA],
    bots: [{ id: "bot", name: "Helper", pubkey: BOT, source: "openclaw" }],
    managedAgents: null,
    members: [{ pubkey: MEMBER }],
    profiles: {
      [ADA]: profile("Ada"),
      [BOT]: profile("Helper", true),
      [MEMBER]: profile("Cam"),
    },
    relayAgents: [{ name: "Relay Bot", pubkey: "d".repeat(64) }],
  });
  assert.deepEqual(labelsIn(withRosters, "members"), ["Ada", "Cam"]);
  assert.deepEqual(labelsIn(withRosters, "community-bots"), ["Helper"]);
  assert.deepEqual(labelsIn(withRosters, "local-agents"), []);
  assert.equal(
    withRosters.some((option) => option.label === "Relay Bot"),
    false,
  );
  const ada = withRosters.find((option) => option.pubkey === ADA);
  assert.deepEqual(ada.names, ["ada"]);
  assert.equal(
    activityEventMatchesMember({ actorName: "Ada", actorPubkey: null }, ada),
    true,
  );
  assert.equal(
    activityEventMatchesMember(
      { actorName: null, actorPubkey: BOT },
      withRosters.find((option) => option.pubkey === BOT),
    ),
    true,
  );
});

test("local agents show their managing member and split active from offline", () => {
  assert.deepEqual(
    ACTIVITY_MEMBER_SECTIONS.map((section) => section.label),
    ["Members", "Community bots", "Local agents", "Archived"],
  );
  const owner = "1".repeat(64);
  const opus = "e".repeat(64);
  const nap = "f".repeat(64);
  const cloud = "9".repeat(64);
  const options = activityMemberOptions({
    authorNames: ["Opus"],
    authorPubkeys: [ADA, opus],
    bots: [{ id: "bot", name: "Helper", pubkey: BOT, source: "openclaw" }],
    managedAgents: [
      {
        backend: { type: "local" },
        name: "Opus",
        ownerPubkey: owner,
        pubkey: opus,
        status: "running",
      },
      {
        backend: { type: "local" },
        name: "Nap",
        pubkey: nap,
        status: "stopped",
      },
      {
        backend: { type: "provider" },
        name: "Cloud",
        pubkey: cloud,
        status: "deployed",
      },
    ],
    members: [{ pubkey: MEMBER }, { pubkey: opus }],
    profiles: {
      [ADA]: profile("Ada"),
      [BOT]: profile("Helper", true),
      [MEMBER]: profile("Cam"),
      [owner]: profile("JM"),
      [opus]: profile("Ignored", true, owner),
      [nap]: profile("Nap", true),
    },
    relayAgents: [{ name: "Opus", ownerPubkey: "2".repeat(64), pubkey: opus }],
  });
  assert.deepEqual(labelsIn(options, "members"), ["Ada", "Cam"]);
  assert.deepEqual(labelsIn(options, "community-bots"), ["Helper"]);
  assert.deepEqual(labelsIn(options, "local-agents"), ["Opus (JM)"]);
  assert.deepEqual(labelsIn(options, "archived"), ["Nap"]);
  assert.equal(
    options.some((option) => option.label === "Cloud"),
    false,
  );
  const opusOption = options.find((option) => option.pubkey === opus);
  assert.deepEqual(opusOption.names, ["opus"]);
  assert.equal(
    activityEventMatchesMember(
      { actorName: "Opus", actorPubkey: null },
      opusOption,
    ),
    true,
  );

  const fromProfile = activityMemberOptions({
    authorNames: [],
    authorPubkeys: [],
    managedAgents: [
      {
        backend: { type: "local" },
        name: "Nap",
        pubkey: nap,
        status: "not_deployed",
      },
    ],
    profiles: {
      [nap]: profile("Nap", true, owner),
      [owner]: profile("JM"),
    },
  });
  assert.deepEqual(labelsIn(fromProfile, "archived"), ["Nap (JM)"]);

  const unknownOwner = activityMemberOptions({
    authorNames: [],
    authorPubkeys: [],
    managedAgents: [
      {
        backend: { type: "local" },
        name: "Opus",
        ownerPubkey: owner,
        pubkey: opus,
        status: "running",
      },
    ],
    profiles: { [opus]: profile("Opus", true, owner) },
  });
  assert.deepEqual(labelsIn(unknownOwner, "local-agents"), ["Opus"]);
});

test("everyone matches every event and a git name does not steal a signed event", () => {
  assert.equal(activityMemberFromId(ACTIVITY_MEMBER_EVERYONE), null);
  assert.equal(
    activityEventMatchesMember({ actorName: "Ada", actorPubkey: ADA }, null),
    true,
  );
  const named = activityMemberFromId("name:git ada");
  assert.equal(
    activityEventMatchesMember(
      { actorName: "Git Ada", actorPubkey: null },
      named,
    ),
    true,
  );
  assert.equal(
    activityEventMatchesMember(
      { actorName: "Git Ada", actorPubkey: ADA },
      named,
    ),
    false,
  );
});

test("community bots are not listed as members", () => {
  const mo = HULA_RESERVED_COMMUNITY_BOT_PUBKEYS.Mo;
  const catalogId = "7".repeat(64);
  const catalogPubkey = "8".repeat(64);
  const options = activityMemberOptions({
    authorNames: [],
    authorPubkeys: [mo, catalogId],
    bots: [
      { id: catalogId, name: "Helper", pubkey: catalogPubkey, source: "openclaw" },
    ],
    members: [{ pubkey: mo }, { pubkey: catalogId }, { pubkey: MEMBER }],
    profiles: {
      [mo]: profile("Mo"),
      [catalogId]: profile("Helper"),
      [catalogPubkey]: profile("Helper"),
      [MEMBER]: profile("Cam"),
      [BOT]: {
        ...profile("Nip Bot"),
        nip05Handle: "bot@hula.example",
      },
    },
  });
  assert.deepEqual(labelsIn(options, "members"), ["Cam"]);
  assert.deepEqual(labelsIn(options, "community-bots").sort(), [
    "Helper",
    "Helper",
    "Mo",
  ]);
  assert.equal(
    options.some((option) => option.section === "members" && option.pubkey === mo),
    false,
  );

  const byNip05 = activityMemberOptions({
    authorNames: [],
    authorPubkeys: [BOT],
    bots: [],
    profiles: {
      [BOT]: { ...profile("Nip Bot"), nip05Handle: "bot@hula.example" },
    },
  });
  assert.deepEqual(labelsIn(byNip05, "community-bots"), ["Nip Bot"]);
  assert.deepEqual(labelsIn(byNip05, "members"), []);
});

test("a project or channel scope does not list the rest of the relay", () => {
  const owner = "1".repeat(64);
  const opus = "e".repeat(64);
  const options = activityMemberOptions({
    authorNames: ["Git Ada"],
    authorPubkeys: [ADA],
    bots: [{ id: "bot", name: "Helper", pubkey: BOT, source: "openclaw" }],
    managedAgents: [
      {
        backend: { type: "local" },
        name: "Opus",
        ownerPubkey: owner,
        pubkey: opus,
        status: "running",
      },
    ],
    members: [{ pubkey: MEMBER }, { pubkey: ADA }, { pubkey: BOT }, { pubkey: opus }],
    profiles: {
      [ADA]: profile("Ada"),
      [BOT]: profile("Helper", true),
      [MEMBER]: profile("Cam"),
      [owner]: profile("JM"),
      [opus]: profile("Opus", true, owner),
    },
    scopedPubkeys: new Set([ADA, BOT, opus]),
  });
  assert.deepEqual(labelsIn(options, "members"), ["Ada", "Git Ada"]);
  assert.deepEqual(labelsIn(options, "community-bots"), ["Helper"]);
  assert.deepEqual(labelsIn(options, "local-agents"), ["Opus (JM)"]);
  assert.equal(options.some((option) => option.label === "Cam"), false);

  const authorsOnly = activityMemberOptions({
    authorNames: [],
    authorPubkeys: [ADA],
    members: [{ pubkey: MEMBER }, { pubkey: ADA }],
    profiles: {
      [ADA]: profile("Ada"),
      [MEMBER]: profile("Cam"),
    },
    scopedPubkeys: new Set([ADA]),
  });
  assert.deepEqual(labelsIn(authorsOnly, "members"), ["Ada"]);
});
