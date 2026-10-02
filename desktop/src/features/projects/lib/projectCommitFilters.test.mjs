import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_COMMIT_AUTHORS,
  ALL_COMMIT_DATES,
  ALL_COMMIT_REPOSITORIES,
  commitAuthorOptions,
  commitDateCutoff,
  filterCommitFeed,
} from "./projectCommitFilters.ts";

const NOW = 1_700_000_000;
const DAY = 24 * 60 * 60;

function filters(overrides = {}) {
  return {
    author: ALL_COMMIT_AUTHORS,
    date: ALL_COMMIT_DATES,
    nowSeconds: NOW,
    query: "",
    repository: ALL_COMMIT_REPOSITORIES,
    ...overrides,
  };
}

function row(
  subject,
  authorName,
  authorEmail,
  hash,
  repoName,
  repoAddress,
  timestamp = 1,
) {
  return {
    commit: {
      authorEmail,
      authorName,
      hash,
      shortHash: hash.slice(0, 7),
      subject,
      timestamp,
    },
    project: { name: repoName, repoAddress },
  };
}

const ada = row(
  "Add the desktop app",
  "Ada Lovelace",
  "ada@example.com",
  "a".repeat(40),
  "claimminer",
  "30617:owner:claimminer",
);
const grace = row(
  "Fix the relay",
  "Grace Hopper",
  "grace@example.com",
  "b".repeat(40),
  "desktop",
  "30617:owner:desktop",
);

test("commit filters match subject, author, email, and hash", () => {
  const items = [ada, grace];
  assert.deepEqual(
    filterCommitFeed(items, filters({ query: "relay" })).map(
      (item) => item.commit.subject,
    ),
    ["Fix the relay"],
  );
  assert.equal(
    filterCommitFeed(items, filters({ query: "ADA@example.com" }))[0]?.commit
      .subject,
    "Add the desktop app",
  );
  assert.equal(
    filterCommitFeed(items, filters({ query: "b".repeat(12) }))[0]?.commit
      .subject,
    "Fix the relay",
  );
  assert.deepEqual(
    filterCommitFeed(items, filters({ author: "ada@example.com" })).map(
      (item) => item.commit.authorName,
    ),
    ["Ada Lovelace"],
  );
  assert.deepEqual(
    filterCommitFeed(items, filters({ repository: "30617:owner:desktop" })).map(
      (item) => item.project.name,
    ),
    ["desktop"],
  );
  assert.equal(
    filterCommitFeed(
      items,
      filters({ author: "ada@example.com", query: "relay" }),
    ).length,
    0,
  );
});

test("date presets keep commits inside the window, including the boundary", () => {
  const recent = row(
    "Recent",
    "Ada Lovelace",
    "ada@example.com",
    "d".repeat(40),
    "claimminer",
    "30617:owner:claimminer",
    NOW - 10 * DAY,
  );
  const edge = row(
    "Edge",
    "Ada Lovelace",
    "ada@example.com",
    "e".repeat(40),
    "claimminer",
    "30617:owner:claimminer",
    NOW - 30 * DAY,
  );
  const older = row(
    "Older",
    "Grace Hopper",
    "grace@example.com",
    "f".repeat(40),
    "desktop",
    "30617:owner:desktop",
    NOW - 30 * DAY - 1,
  );
  const items = [recent, edge, older];
  assert.equal(commitDateCutoff("30d", NOW), NOW - 30 * DAY);
  assert.equal(commitDateCutoff(ALL_COMMIT_DATES, NOW), null);
  assert.equal(commitDateCutoff("nope", NOW), null);
  assert.deepEqual(
    filterCommitFeed(items, filters({ date: "30d" })).map(
      (item) => item.commit.subject,
    ),
    ["Recent", "Edge"],
  );
  assert.deepEqual(
    filterCommitFeed(items, filters({ date: "24h" })).map(
      (item) => item.commit.subject,
    ),
    [],
  );
  assert.deepEqual(
    filterCommitFeed(items, filters({ date: "365d" })).map(
      (item) => item.commit.subject,
    ),
    ["Recent", "Edge", "Older"],
  );
  assert.deepEqual(
    filterCommitFeed(items, filters({ date: "30d", query: "edge" })).map(
      (item) => item.commit.subject,
    ),
    ["Edge"],
  );
});

test("same-name authors stay separate in the filter", () => {
  const otherAda = row(
    "Other note",
    "Ada Lovelace",
    "ada-other@example.com",
    "c".repeat(40),
    "claimminer",
    "30617:owner:claimminer",
  );
  const options = commitAuthorOptions([ada, otherAda]);
  assert.deepEqual(
    options.map((option) => option.label),
    ["Ada Lovelace (ada-other@example.com)", "Ada Lovelace (ada@example.com)"],
  );
});
