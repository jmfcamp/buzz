import assert from "node:assert/strict";
import { test } from "node:test";

import {
  activityScopeChannelMemberPubkeys,
  activityWorkItemInScope,
  projectsIndexActivityScope,
} from "./projectsIndexActivityScope.ts";

const HOME = "11111111-1111-4111-8111-111111111111";
const NESTED = "22222222-2222-4222-8222-222222222222";

function project() {
  return {
    id: "30621:owner:products",
    name: "Products",
    primaryRepositoryAddress: "30617:owner:main",
    projectChannelId: HOME,
    relatedChannelIds: [],
    repositories: [
      {
        id: "main",
        name: "main",
        repoAddress: "30617:owner:main",
        channelId: HOME,
      },
      {
        id: "nested",
        name: "nested",
        repoAddress: "30617:owner:nested",
        channelId: NESTED,
      },
    ],
  };
}

test("all activity is unscoped", () => {
  assert.equal(projectsIndexActivityScope({ type: "all" }, [project()]), null);
  assert.equal(
    activityWorkItemInScope(null, "30621:owner:products", "nested"),
    true,
  );
});

test("a project filter keeps that project's events", () => {
  const scope = projectsIndexActivityScope(
    { type: "project", projectId: "30621:owner:products" },
    [project()],
  );
  assert.equal(scope.entries.length, 1);
  assert.equal(scope.entries[0].includeProjectEvents, true);
  assert.equal(scope.entries[0].repositoryIds, null);
  assert.equal(
    activityWorkItemInScope(scope, "30621:owner:products", "nested"),
    true,
  );
  assert.equal(activityWorkItemInScope(scope, "other", "main"), false);
});

test("a repository channel keeps that repository, and project commits only for primary", () => {
  const home = projectsIndexActivityScope(
    { type: "channel", channelId: HOME },
    [project()],
  );
  assert.equal(home.entries[0].includeProjectEvents, true);
  assert.deepEqual([...(home.entries[0].repositoryIds ?? [])], ["main"]);
  assert.equal(
    activityWorkItemInScope(home, "30621:owner:products", "main"),
    true,
  );
  assert.equal(
    activityWorkItemInScope(home, "30621:owner:products", "nested"),
    false,
  );

  const nested = projectsIndexActivityScope(
    { type: "channel", channelId: NESTED },
    [project()],
  );
  assert.equal(nested.entries[0].includeProjectEvents, false);
  assert.deepEqual([...(nested.entries[0].repositoryIds ?? [])], ["nested"]);
});

test("an unknown channel matches nothing", () => {
  const scope = projectsIndexActivityScope(
    { type: "channel", channelId: "missing" },
    [project()],
  );
  assert.deepEqual(scope.entries, []);
  assert.equal(
    activityWorkItemInScope(scope, "30621:owner:products", "main"),
    false,
  );
});

const ADA = "a".repeat(64);
const BOT = "b".repeat(64);
const CAM = "c".repeat(64);

test("a project or channel who-list uses related channel members, not the relay", () => {
  const channels = new Map([
    [HOME, { id: HOME, memberPubkeys: [ADA.toUpperCase(), BOT] }],
    [NESTED, { id: NESTED, memberPubkeys: [CAM] }],
    ["other", { id: "other", memberPubkeys: ["d".repeat(64)] }],
  ]);
  assert.equal(
    activityScopeChannelMemberPubkeys({ type: "all" }, [project()], channels),
    null,
  );

  const forProject = activityScopeChannelMemberPubkeys(
    { type: "project", projectId: "30621:owner:products" },
    [project()],
    channels,
  );
  assert.deepEqual([...forProject].sort(), [ADA, BOT, CAM].sort());

  const forChannel = activityScopeChannelMemberPubkeys(
    { type: "channel", channelId: NESTED },
    [project()],
    channels,
  );
  assert.deepEqual([...forChannel].sort(), [ADA, BOT, CAM].sort());

  const unloaded = activityScopeChannelMemberPubkeys(
    { type: "project", projectId: "30621:owner:products" },
    [project()],
    new Map([[HOME, { id: HOME }], [NESTED, { id: NESTED, memberPubkeys: [CAM] }]]),
  );
  assert.deepEqual([...unloaded], [CAM]);

  const unknown = activityScopeChannelMemberPubkeys(
    { type: "channel", channelId: "missing" },
    [project()],
    channels,
  );
  assert.deepEqual([...unknown], []);
});
