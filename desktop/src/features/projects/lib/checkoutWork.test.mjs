import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKOUT_EMPTY_TREES,
  CHECKOUT_NUMSTAT_ARGV,
  CHECKOUT_STATUS_ARGV,
  branchFromCheckoutStatus,
  buildCheckoutWorkCard,
  checkoutCommitNumstatArgv,
  checkoutLogArgv,
  checkoutWorkCardMessageId,
  checkoutWorkFingerprint,
  checkoutWorkSource,
  commitWithNumstat,
  parseCheckoutWork,
  parseGitMediumNumstat,
  parseGitNumstat,
  repositoryRowBranch,
} from "./checkoutWork.ts";

const HASH = "a".repeat(40);

test("numstat argv is read-only and git log skips --numstat", () => {
  assert.deepEqual(CHECKOUT_STATUS_ARGV.slice(0, 2), ["git", "status"]);
  assert.deepEqual(CHECKOUT_NUMSTAT_ARGV, ["git", "diff", "--numstat", "HEAD"]);
  assert.deepEqual(checkoutLogArgv(), [
    "git",
    "log",
    "-n",
    "8",
    "--pretty=medium",
    "--no-color",
    "HEAD",
  ]);
  assert.equal(checkoutLogArgv().includes("--numstat"), false);
  assert.deepEqual(checkoutCommitNumstatArgv(HASH), [
    "git",
    "diff",
    "--numstat",
    `${HASH}~1`,
    HASH,
  ]);
  assert.deepEqual(checkoutCommitNumstatArgv(HASH, CHECKOUT_EMPTY_TREES[0]), [
    "git",
    "diff",
    "--numstat",
    CHECKOUT_EMPTY_TREES[0],
    HASH,
  ]);
  assert.equal(checkoutCommitNumstatArgv("HEAD"), null);
  assert.equal(checkoutCommitNumstatArgv("--numstat"), null);
  assert.equal(checkoutCommitNumstatArgv(HASH, "HEAD"), null);
});

test("parseGitNumstat keeps binary files without inventing counts", () => {
  const files = parseGitNumstat(
    '12\t3\tsrc/a.ts\n-\t-\tassets/logo.bin\n1\t0\t"spaced name.ts"\n',
  );
  assert.deepEqual(files, [
    { path: "src/a.ts", additions: 12, deletions: 3 },
    { path: "assets/logo.bin", additions: null, deletions: null },
    { path: "spaced name.ts", additions: 1, deletions: 0 },
  ]);
});

test("parseCheckoutWork joins untracked files and commits", () => {
  const status = [
    "## feature/chat...origin/feature/chat",
    " M src/a.ts",
    "?? src/new.ts",
  ].join("\n");
  const numstat = "4\t1\tsrc/a.ts\n";
  const log = [
    "commit abcdef1234567890",
    "Author: Ada <ada@example.com>",
    "Date:   Sat Oct 3 12:00:00 2026 -0700",
    "",
    "    Record the checkout",
    "",
    "2\t0\tsrc/a.ts",
    "",
  ].join("\n");
  const work = parseCheckoutWork("/tmp/repo", status, numstat, log);
  assert.equal(branchFromCheckoutStatus(status), "feature/chat");
  assert.equal(work.branch, "feature/chat");
  assert.equal(work.head, "abcdef1234567890");
  assert.equal(work.additions, 4);
  assert.equal(work.deletions, 1);
  assert.deepEqual(
    work.files.map((file) => file.path),
    ["src/a.ts", "src/new.ts"],
  );
  assert.equal(work.files[1].untracked, true);
  assert.equal(work.files[1].additions, null);
  assert.equal(work.commits[0].subject, "Record the checkout");
  assert.equal(work.commits[0].additions, 2);
  assert.equal(parseGitMediumNumstat(log)[0].shortHash, "abcdef1");
});

test("card uses the worktree, and a commit only when it is still HEAD", () => {
  const work = parseCheckoutWork(
    "/tmp/repo",
    "## main\n?? src/new.ts\n",
    "1\t0\tsrc/a.ts\n",
    [
      "commit abcdef1234567890",
      "Author: Ada <ada@example.com>",
      "Date:   Sat Oct 3 12:00:00 2026 -0700",
      "",
      "    Record the checkout",
      "",
      "9\t1\tsrc/a.ts",
    ].join("\n"),
  );
  const dirty = buildCheckoutWorkCard(work, null);
  assert.equal(dirty?.fileCount, 2);
  assert.equal(dirty?.commit, null);
  const linked = buildCheckoutWorkCard(work, work.head);
  assert.equal(linked?.commit?.shortHash, "abcdef1");
  const stale = buildCheckoutWorkCard(work, "ffffffffffffffff");
  assert.equal(stale?.commit, null);
  const clean = {
    ...work,
    files: [],
    additions: 0,
    deletions: 0,
  };
  assert.equal(buildCheckoutWorkCard(clean, null), null);
  assert.equal(buildCheckoutWorkCard(clean, work.head)?.fileCount, 1);
  assert.equal(buildCheckoutWorkCard(clean, work.head)?.additions, 9);
});

test("card message is the latest finished agent reply", () => {
  const messages = [
    { id: "user", isAgent: false },
    { id: "agent", isAgent: true },
  ];
  assert.equal(checkoutWorkCardMessageId(messages, false), "agent");
  assert.equal(checkoutWorkCardMessageId(messages, true), null);
  assert.equal(
    checkoutWorkCardMessageId(
      [...messages, { id: "follow-up", isAgent: false }],
      false,
    ),
    null,
  );
  assert.equal(
    checkoutWorkCardMessageId(
      [{ id: "pending", isAgent: true, pending: true }],
      false,
    ),
    null,
  );
});

test("source prefers an OpenClaw path and otherwise a clone url", () => {
  assert.deepEqual(
    checkoutWorkSource({
      hulaPath: "/Hula/project",
      repositories: [
        {
          hulaPath: "/Hula/project/repo",
          dtag: "repo",
          cloneUrls: ["https://example.com/repo.git"],
        },
      ],
    }),
    { kind: "hula", root: "Hula/project/repo" },
  );
  assert.deepEqual(
    checkoutWorkSource({
      repositories: [
        {
          dtag: "repo",
          cloneUrls: ["https://example.com/repo.git"],
        },
      ],
    }),
    {
      kind: "local",
      projectDtag: "repo",
      cloneUrl: "https://example.com/repo.git",
    },
  );
  assert.equal(
    checkoutWorkSource({ repositories: [{ dtag: "repo", cloneUrls: [] }] }),
    null,
  );
});

test("source stays on the requested repository", () => {
  const project = {
    hulaPath: "Hula/hulabill",
    repositories: [
      {
        hulaPath: "Hula/hulabill",
        dtag: "hulabill",
        cloneUrls: ["https://example.com/hulabill.git"],
      },
      {
        hulaPath: "Hula/hulabill/hulabill-acs-services",
        dtag: "hulabill-acs-services",
        cloneUrls: ["https://example.com/acs.git"],
      },
    ],
  };
  assert.deepEqual(checkoutWorkSource(project, project.repositories[1]), {
    kind: "hula",
    root: "Hula/hulabill/hulabill-acs-services",
  });
  assert.equal(
    checkoutWorkSource(project, {
      dtag: "hulabill-acs-services",
      cloneUrls: [],
      hulaPath: null,
    }),
    null,
  );
});

test("fingerprint changes when HEAD or the worktree changes", () => {
  const work = parseCheckoutWork("/tmp/repo", "## main\n", "1\t0\ta.ts\n", "");
  const other = parseCheckoutWork("/tmp/repo", "## main\n", "2\t0\ta.ts\n", "");
  assert.notEqual(
    checkoutWorkFingerprint(work),
    checkoutWorkFingerprint(other),
  );
});

test("commitWithNumstat copies diff counts onto the commit", () => {
  const commit = parseGitMediumNumstat(
    [
      `commit ${HASH}`,
      "Author: Ada <ada@example.com>",
      "Date:   Sat Oct 3 12:00:00 2026 -0700",
      "",
      "    Record the checkout",
      "",
    ].join("\n"),
  )[0];
  const withCounts = commitWithNumstat(commit, "3\t1\tsrc/a.ts\n");
  assert.equal(withCounts.subject, "Record the checkout");
  assert.equal(withCounts.additions, 3);
  assert.equal(withCounts.deletions, 1);
  assert.deepEqual(withCounts.files, [
    { path: "src/a.ts", additions: 3, deletions: 1 },
  ]);
});

test("the index row shows the checked-out branch, not a stored default", () => {
  assert.equal(
    repositoryRowBranch({
      checkoutWork: { branch: "merge/upstream-0.5.26" },
      statusBranch: "main",
    }),
    "merge/upstream-0.5.26",
  );
  assert.equal(
    repositoryRowBranch({
      checkoutWork: { branch: null },
      statusBranch: "main",
    }),
    null,
  );
  assert.equal(
    repositoryRowBranch({
      checkoutWork: null,
      statusBranch: "feature/checkout",
    }),
    "feature/checkout",
  );
  assert.equal(repositoryRowBranch({ checkoutWork: undefined }), null);
  assert.equal(
    repositoryRowBranch({ checkoutWork: undefined, statusBranch: null }),
    null,
  );
});

