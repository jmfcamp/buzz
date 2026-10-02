import assert from "node:assert/strict";
import test from "node:test";

import {
  KIND_GIT_ISSUE,
  KIND_GIT_STATUS_DRAFT,
  KIND_GIT_STATUS_MERGED,
  KIND_GIT_STATUS_OPEN,
} from "@/shared/constants/kinds.ts";
import {
  isProjectWorkItemQueryKey,
  projectWorkItemEventMatchesAddresses,
  projectWorkItemLiveFilter,
  projectWorkItemRepoAddresses,
} from "./projectWorkItemLive.ts";

const REPO = "30617:aa:products-hulabill";

test("live task filter follows repository addresses and skips history", () => {
  const filter = projectWorkItemLiveFilter(
    projectWorkItemRepoAddresses([
      {
        repositories: [
          { repoAddress: REPO },
          { repoAddress: "30617:aa:other" },
        ],
      },
      { repositories: [{ repoAddress: REPO }] },
    ]),
  );

  assert.equal(filter.limit, 0);
  assert.deepEqual(filter["#a"], ["30617:aa:other", REPO]);
  assert.ok(filter.kinds.includes(KIND_GIT_ISSUE));
  assert.ok(filter.kinds.includes(KIND_GIT_STATUS_OPEN));
  assert.ok(filter.kinds.includes(KIND_GIT_STATUS_MERGED));
  assert.ok(filter.kinds.includes(KIND_GIT_STATUS_DRAFT));
});

test("only an event for a followed repository refreshes tasks", () => {
  const addresses = new Set([REPO]);
  assert.equal(
    projectWorkItemEventMatchesAddresses({ tags: [["a", REPO]] }, addresses),
    true,
  );
  assert.equal(
    projectWorkItemEventMatchesAddresses(
      { tags: [["a", "30617:bb:elsewhere"]] },
      addresses,
    ),
    false,
  );
  assert.equal(
    projectWorkItemEventMatchesAddresses({ tags: [] }, addresses),
    false,
  );
});

test("a live task event refreshes task queries and leaves the project list alone", () => {
  assert.equal(
    isProjectWorkItemQueryKey(["projects", "work-items", "one"]),
    true,
  );
  assert.equal(
    isProjectWorkItemQueryKey(["projects", "activity-summaries", "one"]),
    true,
  );
  assert.equal(isProjectWorkItemQueryKey(["project", "repo", "issues"]), true);
  assert.equal(
    isProjectWorkItemQueryKey(["project", "repo", "pull-requests"]),
    true,
  );
  assert.equal(isProjectWorkItemQueryKey(["projects"]), false);
  assert.equal(isProjectWorkItemQueryKey(["projects", "repo-snapshot"]), false);
});
