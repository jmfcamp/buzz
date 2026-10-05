import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKOUT_BRANCH_LIST_ARGV,
  CHECKOUT_EMPTY_TREES,
  CHECKOUT_NUMSTAT_ARGV,
  CHECKOUT_STATUS_ARGV,
  CHECKOUT_WORKTREE_LIST_ARGV,
  aheadCountFromCheckoutStatus,
  branchFromCheckoutStatus,
  buildCheckoutWorkCard,
  checkoutAgentPrompt,
  checkoutBranchUniqueCountArgv,
  checkoutCommitNumstatArgv,
  checkoutLogArgv,
  checkoutRailLeadingOptions,
  checkoutRailSections,
  checkoutRefLogArgv,
  checkoutSelectionId,
  checkoutUniqueLogArgv,
  checkoutWorkCardMessageId,
  checkoutWorkFingerprint,
  checkoutWorkSource,
  checkoutWorktreeLabel,
  commitWithNumstat,
  isCheckoutSelectionStale,
  isDefaultBranchSelection,
  parseCheckoutWork,
  parseGitMediumNumstat,
  parseGitNumstat,
  parseIgnoredPaths,
  parseLocalBranchList,
  parseRevListCount,
  checkoutSelectionChips,
  checkoutFilesContext,
  isFileLikePathSegment,
  pickDefaultCheckoutSelection,
  resolveCheckoutFilesBrowseTarget,
  resolveCheckoutFilesContext,
  repositoryRowBranch,
  parsePullRequests,
  pullRequestsForBase,
  pullRequestsForBranch,
  isBranchMerged,
} from "./checkoutWork.ts";

const HASH = "a".repeat(40);

test("numstat argv is read-only and git log skips --numstat", () => {
  assert.deepEqual(CHECKOUT_STATUS_ARGV.slice(0, 2), ["git", "status"]);
  assert.equal(CHECKOUT_STATUS_ARGV.includes("--untracked-files=all"), true);
  assert.equal(CHECKOUT_STATUS_ARGV.includes("--ignored"), true);
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

test("parseCheckoutWork joins ignored files and skips ignored directories", () => {
  const status = [
    "## feature/review",
    " M src/a.ts",
    "?? src/new.ts",
    "!! docs/buzz-review-test.md",
    "!! build/",
    "!! .env",
  ].join("\n");
  const numstat = "4\t1\tsrc/a.ts\n";
  const work = parseCheckoutWork("/tmp/repo", status, numstat, "");
  assert.deepEqual(
    work.files.map((file) => [
      file.path,
      file.untracked === true,
      file.ignored === true,
      file.additions,
    ]),
    [
      ["src/a.ts", false, false, 4],
      ["src/new.ts", true, false, null],
      ["docs/buzz-review-test.md", false, true, null],
      [".env", false, true, null],
    ],
  );
  assert.equal(
    work.files.some((file) => file.path === "build" || file.path === "build/"),
    false,
  );
  assert.deepEqual(parseIgnoredPaths(status), [
    "docs/buzz-review-test.md",
    ".env",
  ]);
  // Ignored/untracked have no line counts; tracked still drive +/-.
  assert.equal(work.additions, 4);
  assert.equal(work.deletions, 1);
  assert.equal(work.files.length, 4);
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

test("worktree and branch list argv stay read-only", () => {
  assert.deepEqual(CHECKOUT_WORKTREE_LIST_ARGV, [
    "git",
    "worktree",
    "list",
    "--porcelain",
  ]);
  assert.deepEqual(CHECKOUT_BRANCH_LIST_ARGV, [
    "git",
    "branch",
    "--list",
    "--format=%(refname:short)",
  ]);
});

test("ahead count parses from status branch line", () => {
  assert.equal(
    aheadCountFromCheckoutStatus("## main...origin/main [ahead 3]\n"),
    3,
  );
  assert.equal(
    aheadCountFromCheckoutStatus(
      "## feature...origin/feature [ahead 1, behind 2]\n",
    ),
    1,
  );
  assert.equal(aheadCountFromCheckoutStatus("## main\n"), null);
});

test("worktree labels use the directory name", () => {
  assert.equal(
    checkoutWorktreeLabel(
      "/Users/jm/Documents/research/.worktrees/research-test-1",
    ),
    "research-test-1",
  );
  assert.equal(checkoutWorktreeLabel("Hula/projects/research"), "research");
});

test("unique commit argv and local branch parsing", () => {
  assert.deepEqual(checkoutBranchUniqueCountArgv("main", "feature/chat"), [
    "git",
    "rev-list",
    "--count",
    "main..feature/chat",
  ]);
  assert.deepEqual(checkoutUniqueLogArgv("main", "feature/chat"), [
    "git",
    "log",
    "-n",
    "8",
    "--pretty=medium",
    "--no-color",
    "main..feature/chat",
  ]);
  assert.equal(checkoutUniqueLogArgv("main", "--all"), null);
  assert.deepEqual(parseLocalBranchList("main\nfeature/chat\n\nmain\n"), [
    "main",
    "feature/chat",
  ]);
  assert.equal(parseRevListCount("4\n"), 4);
});

test("stale means clean with no commits past the default branch", () => {
  assert.equal(
    isCheckoutSelectionStale({ uniqueCommitCount: 0, dirtyFileCount: 0 }),
    true,
  );
  assert.equal(
    isCheckoutSelectionStale({ uniqueCommitCount: 2, dirtyFileCount: 0 }),
    false,
  );
  assert.equal(
    isCheckoutSelectionStale({ uniqueCommitCount: 0, dirtyFileCount: 1 }),
    false,
  );
  assert.equal(
    isCheckoutSelectionStale({
      uniqueCommitCount: 5,
      dirtyFileCount: 0,
      prunable: true,
    }),
    true,
  );
});

test("rail sections omit empty groups and use exact labels", () => {
  const sections = checkoutRailSections([
    {
      id: checkoutSelectionId("branch", "side"),
      kind: "branch",
      label: "side",
      section: "branches",
      stale: false,
      checkoutPath: null,
      branch: "side",
      uniqueCommitCount: 1,
      dirtyFileCount: 0,
    },
    {
      id: checkoutSelectionId("worktree", "/tmp/research"),
      kind: "worktree",
      label: "research",
      section: "worktrees",
      stale: false,
      checkoutPath: "/tmp/research",
      branch: "main",
      uniqueCommitCount: 0,
      dirtyFileCount: 0,
    },
    {
      id: checkoutSelectionId("worktree", "/tmp/wt"),
      kind: "worktree",
      label: "research-test-1",
      section: "worktrees",
      stale: false,
      checkoutPath: "/tmp/wt",
      branch: "feature",
      uniqueCommitCount: 2,
      dirtyFileCount: 0,
    },
    {
      id: checkoutSelectionId("branch", "old"),
      kind: "branch",
      label: "old",
      section: "stale-branches",
      stale: true,
      checkoutPath: null,
      branch: "old",
      uniqueCommitCount: 0,
      dirtyFileCount: 0,
    },
  ]);
  assert.deepEqual(
    sections.map((section) => [
      section.id,
      section.label,
      section.options.length,
    ]),
    [
      ["branches", "Branches", 1],
      ["worktrees", "Worktrees", 2],
      ["stale-branches", "Stale branches", 1],
    ],
  );
});

test("leading options are default branch then Checkout", () => {
  const defaultBranch = "main";
  const selections = [
    {
      id: checkoutSelectionId("branch", "main"),
      kind: "branch",
      label: "main",
      section: "branches",
      stale: false,
      checkoutPath: null,
      branch: "main",
      uniqueCommitCount: 0,
      dirtyFileCount: 0,
    },
    {
      id: checkoutSelectionId("checkout", "Hula/products/hulabill"),
      kind: "checkout",
      label: "hulabill",
      section: "branches",
      stale: false,
      checkoutPath: "Hula/products/hulabill",
      branch: "feat/x",
      uniqueCommitCount: 2,
      dirtyFileCount: 1,
    },
    {
      id: checkoutSelectionId("branch", "feat/x"),
      kind: "branch",
      label: "feat/x",
      section: "branches",
      stale: false,
      checkoutPath: null,
      branch: "feat/x",
      uniqueCommitCount: 2,
      dirtyFileCount: 0,
    },
  ];
  assert.deepEqual(
    checkoutRailLeadingOptions(selections, defaultBranch).map((s) => s.id),
    [
      checkoutSelectionId("branch", "main"),
      checkoutSelectionId("checkout", "Hula/products/hulabill"),
    ],
  );
  const sections = checkoutRailSections(selections, defaultBranch);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].id, "branches");
  assert.deepEqual(
    sections[0].options.map((option) => option.label),
    ["feat/x"],
  );
});

test("default selection prefers open work over stale", () => {
  const catalog = {
    primaryPath: "Hula/products/research",
    primaryDisplayPath: "Hula/products/research",
    currentName: "main",
    defaultBranch: "main",
    selections: [
      {
        id: checkoutSelectionId("checkout", "Hula/products/research"),
        kind: "checkout",
        label: "research",
        section: "branches",
        stale: true,
        checkoutPath: "Hula/products/research",
        branch: "main",
        uniqueCommitCount: 0,
        dirtyFileCount: 0,
      },
      {
        id: checkoutSelectionId("worktree", "Hula/products/research-wt"),
        kind: "worktree",
        label: "research-wt",
        section: "worktrees",
        stale: false,
        checkoutPath: "Hula/products/research-wt",
        branch: "feature",
        uniqueCommitCount: 2,
        dirtyFileCount: 0,
      },
    ],
  };
  assert.equal(
    pickDefaultCheckoutSelection(catalog),
    checkoutSelectionId("worktree", "Hula/products/research-wt"),
  );
  catalog.selections[0] = {
    ...catalog.selections[0],
    stale: false,
    dirtyFileCount: 1,
  };
  assert.equal(
    pickDefaultCheckoutSelection(catalog),
    checkoutSelectionId("checkout", "Hula/products/research"),
  );
});

test("selection chips: Checkout+Current, worktree, main, branch", () => {
  const catalog = {
    primaryPath: "Hula/products/research",
    primaryDisplayPath: "Hula/products/research",
    currentName: "main",
    defaultBranch: "main",
    selections: [],
  };
  const primary = {
    id: checkoutSelectionId("checkout", "Hula/products/research"),
    kind: "checkout",
    label: "research",
    section: "branches",
    stale: false,
    checkoutPath: "Hula/products/research",
    branch: "main",
    uniqueCommitCount: 0,
    dirtyFileCount: 1,
  };
  assert.deepEqual(checkoutSelectionChips(primary, catalog), [
    "Checkout",
    "Current",
  ]);

  const worktree = {
    id: checkoutSelectionId("worktree", "Hula/products/research-wt"),
    kind: "worktree",
    label: "research-wt",
    section: "worktrees",
    stale: false,
    checkoutPath: "Hula/products/research-wt",
    branch: "feature",
    uniqueCommitCount: 2,
    dirtyFileCount: 0,
  };
  assert.deepEqual(checkoutSelectionChips(worktree, catalog), ["worktree"]);

  const branch = {
    id: checkoutSelectionId("branch", "side"),
    kind: "branch",
    label: "side",
    section: "branches",
    stale: false,
    checkoutPath: null,
    branch: "side",
    uniqueCommitCount: 1,
    dirtyFileCount: 0,
  };
  assert.deepEqual(checkoutSelectionChips(branch, catalog), ["branch"]);

  const mainBranch = {
    ...branch,
    id: checkoutSelectionId("branch", "main"),
    label: "main",
    branch: "main",
  };
  assert.deepEqual(checkoutSelectionChips(mainBranch, catalog), [
    "main",
    "Current",
  ]);

  // main selected while HEAD is a feature branch → main chip, no Current
  assert.deepEqual(
    checkoutSelectionChips(mainBranch, {
      ...catalog,
      currentName: "feat/add-stack",
    }),
    ["main"],
  );

  assert.deepEqual(
    checkoutSelectionChips({ ...primary, stale: true }, catalog),
    ["Checkout", "Current", "stale"],
  );

  // Merged omits stale even when the selection is marked stale.
  assert.deepEqual(
    checkoutSelectionChips({ ...primary, stale: true }, catalog, {
      merged: true,
    }),
    ["Checkout", "Current", "merged"],
  );
  assert.deepEqual(checkoutSelectionChips(branch, catalog, { merged: true }), [
    "branch",
    "merged",
  ]);
});

test("file-like path segments are rejected as worktree directories", () => {
  assert.equal(isFileLikePathSegment("Hula/products/research-test.md"), true);
  assert.equal(isFileLikePathSegment("research-test.md"), true);
  assert.equal(isFileLikePathSegment("Hula/products/hulabill"), false);
  assert.equal(isFileLikePathSegment("Hula/products/research-wt"), false);
});

test("files browse target uses worktree HEAD or branch ref", () => {
  const catalog = { primaryPath: "Hula/products/hulabill" };
  const checkout = {
    id: checkoutSelectionId("checkout", "Hula/products/hulabill"),
    kind: "checkout",
    label: "hulabill",
    section: "branches",
    stale: false,
    checkoutPath: "Hula/products/hulabill",
    branch: "feat/x",
    uniqueCommitCount: 1,
    dirtyFileCount: 1,
  };
  assert.deepEqual(resolveCheckoutFilesBrowseTarget(checkout, catalog), {
    root: "Hula/products/hulabill",
    gitRef: "HEAD",
  });

  const worktree = {
    id: checkoutSelectionId("worktree", "Hula/products/hulabill-wt"),
    kind: "worktree",
    label: "hulabill-wt",
    section: "worktrees",
    stale: false,
    checkoutPath: "Hula/products/hulabill-wt",
    branch: "feature",
    uniqueCommitCount: 2,
    dirtyFileCount: 0,
  };
  assert.deepEqual(resolveCheckoutFilesBrowseTarget(worktree, catalog), {
    root: "Hula/products/hulabill-wt",
    gitRef: "HEAD",
  });

  const branch = {
    id: checkoutSelectionId("branch", "side"),
    kind: "branch",
    label: "side",
    section: "branches",
    stale: false,
    checkoutPath: null,
    branch: "side",
    uniqueCommitCount: 1,
    dirtyFileCount: 0,
  };
  assert.deepEqual(resolveCheckoutFilesBrowseTarget(branch, catalog), {
    root: "Hula/products/hulabill",
    gitRef: "side",
  });

  const mainOnCheckout = {
    id: checkoutSelectionId("branch", "main"),
    kind: "branch",
    label: "main",
    section: "branches",
    stale: false,
    checkoutPath: "Hula/products/hulabill",
    branch: "main",
    uniqueCommitCount: 0,
    dirtyFileCount: 1,
  };
  assert.deepEqual(resolveCheckoutFilesBrowseTarget(mainOnCheckout, catalog), {
    root: "Hula/products/hulabill",
    gitRef: "main",
  });
});

test("files context labels each selection like the rail", () => {
  const primaryPath = "Hula/products/hulabill";
  const base = {
    section: "branches",
    stale: false,
    uniqueCommitCount: 1,
    dirtyFileCount: 0,
  };
  const checkout = {
    ...base,
    id: checkoutSelectionId("checkout", primaryPath),
    kind: "checkout",
    label: "hulabill",
    checkoutPath: primaryPath,
    branch: "feat/x",
  };
  const worktree = {
    ...base,
    id: checkoutSelectionId("worktree", "Hula/products/hulabill-wt"),
    kind: "worktree",
    label: "hulabill-wt",
    section: "worktrees",
    checkoutPath: "Hula/products/hulabill-wt",
    branch: "feature",
  };
  const main = {
    ...base,
    id: checkoutSelectionId("branch", "main"),
    kind: "branch",
    label: "main",
    checkoutPath: null,
    branch: "main",
    uniqueCommitCount: 0,
  };
  const current = {
    ...base,
    id: checkoutSelectionId("branch", "feat/x"),
    kind: "branch",
    label: "feat/x",
    checkoutPath: null,
    branch: "feat/x",
  };
  const stale = {
    ...base,
    id: checkoutSelectionId("branch", "old"),
    kind: "branch",
    label: "old",
    section: "stale-branches",
    stale: true,
    checkoutPath: null,
    branch: "old",
    uniqueCommitCount: 0,
  };
  const catalog = {
    primaryPath,
    primaryDisplayPath: primaryPath,
    currentName: "feat/x",
    defaultBranch: "main",
    selections: [main, checkout, worktree, current, stale],
  };

  assert.deepEqual(checkoutFilesContext(checkout, catalog), {
    kind: "checkout",
    label: "feat/x",
    branch: null,
    chips: ["Checkout", "Current"],
    path: primaryPath,
  });
  assert.deepEqual(checkoutFilesContext(worktree, catalog), {
    kind: "worktree",
    label: "hulabill-wt",
    branch: "feature",
    chips: ["worktree"],
    path: "Hula/products/hulabill-wt",
  });
  assert.deepEqual(checkoutFilesContext(main, catalog), {
    kind: "branch",
    label: "main",
    branch: null,
    chips: ["main"],
    path: null,
  });
  assert.deepEqual(checkoutFilesContext(current, catalog).chips, [
    "branch",
    "Current",
  ]);
  assert.deepEqual(checkoutFilesContext(stale, catalog).chips, [
    "branch",
    "stale",
  ]);
  // main checked out in the primary keeps its on-disk path
  assert.equal(
    checkoutFilesContext({ ...main, checkoutPath: primaryPath }, catalog).path,
    primaryPath,
  );

  // Without a rail selection, match what the sheet displays.
  assert.equal(
    resolveCheckoutFilesContext(
      { root: `${primaryPath}/`, gitRef: "HEAD" },
      catalog,
    )?.kind,
    "checkout",
  );
  assert.equal(
    resolveCheckoutFilesContext({ root: primaryPath }, catalog)?.label,
    "feat/x",
  );
  assert.equal(
    resolveCheckoutFilesContext(
      { root: "Hula/products/hulabill-wt", gitRef: "HEAD" },
      catalog,
    )?.label,
    "hulabill-wt",
  );
  assert.deepEqual(
    resolveCheckoutFilesContext({ root: primaryPath, gitRef: "main" }, catalog)
      ?.chips,
    ["main"],
  );
  assert.equal(
    resolveCheckoutFilesContext(
      { root: "Hula/products/other", gitRef: "HEAD" },
      catalog,
    ),
    null,
  );
  assert.equal(
    resolveCheckoutFilesContext(
      { root: primaryPath, gitRef: "missing" },
      catalog,
    ),
    null,
  );
  assert.equal(
    resolveCheckoutFilesContext({ root: primaryPath, gitRef: "HEAD" }, null),
    null,
  );
});

const promptBase = {
  primaryPath: "Hula/products/hulabill",
  hulaPath: "Hula/products/hulabill",
  defaultBranch: "main",
};
const promptFinish =
  "Make and commit changes only there, and follow the Hula skills in the OpenClaw workspace for commits, pushes, and the pull request.";

test("checkoutAgentPrompt: worktree names the worktree, branch, and base", () => {
  assert.equal(
    checkoutAgentPrompt({
      ...promptBase,
      kind: "worktree",
      branch: "test/local-agent-file-pr",
      path: "Hula/products/hulabill/.worktrees/research-test-1",
    }),
    [
      "You are working on the Hula project at Hula/products/hulabill.",
      "Work only in the worktree at Hula/products/hulabill/.worktrees/research-test-1 on branch test/local-agent-file-pr (base: main).",
      promptFinish,
    ].join("\n"),
  );
});

test("checkoutAgentPrompt: checkout names the primary tree", () => {
  assert.equal(
    checkoutAgentPrompt({
      ...promptBase,
      kind: "checkout",
      branch: "feat/invoices",
      path: "Hula/products/hulabill",
    }),
    [
      "You are working on the Hula project at Hula/products/hulabill.",
      "Work only in the checkout at Hula/products/hulabill on branch feat/invoices (base: main).",
      promptFinish,
    ].join("\n"),
  );
});

test("checkoutAgentPrompt: branch without a tree asks to check it out first", () => {
  assert.equal(
    checkoutAgentPrompt({
      ...promptBase,
      kind: "branch",
      branch: "fix/rounding",
      path: null,
    }),
    [
      "You are working on the Hula project at Hula/products/hulabill.",
      "Branch fix/rounding (base: main) is not checked out. From Hula/products/hulabill, check it out or create a worktree for it as the Hula skills describe before working.",
    ].join("\n"),
  );
});

test("checkoutAgentPrompt: main says to branch off and never commit to it", () => {
  assert.equal(
    checkoutAgentPrompt({
      ...promptBase,
      kind: "main",
      branch: "main",
      path: null,
    }),
    [
      "You are working on the Hula project at Hula/products/hulabill.",
      "Start from main at Hula/products/hulabill and create your branch the way the Hula skills describe; do not commit directly to main.",
    ].join("\n"),
  );
});

test("checkoutRefLogArgv lists recent history without a range", () => {
  assert.deepEqual(checkoutRefLogArgv("main"), [
    "git",
    "log",
    "-n",
    "30",
    "--pretty=medium",
    "--no-color",
    "main",
  ]);
  assert.equal(checkoutRefLogArgv("-bad"), null);
});

test("isDefaultBranchSelection only matches the default branch row", () => {
  const catalog = { defaultBranch: "main" };
  assert.equal(
    isDefaultBranchSelection({ kind: "branch", branch: "main" }, catalog),
    true,
  );
  assert.equal(
    isDefaultBranchSelection({ kind: "checkout", branch: "main" }, catalog),
    false,
  );
  assert.equal(
    isDefaultBranchSelection({ kind: "branch", branch: "feat/x" }, catalog),
    false,
  );
});

test("parsePullRequests maps gh states including draft", () => {
  const prs = parsePullRequests(
    JSON.stringify([
      {
        number: 1,
        title: "Open one",
        state: "OPEN",
        isDraft: false,
        url: "https://example.com/1",
        headRefName: "feat/a",
        baseRefName: "main",
      },
      {
        number: 2,
        title: "Draft one",
        state: "open",
        isDraft: true,
        url: "https://example.com/2",
        headRefName: "feat/b",
        baseRefName: "main",
      },
      {
        number: 3,
        title: "Merged one",
        state: "MERGED",
        isDraft: false,
        url: "https://example.com/3",
        headRefName: "feat/c",
        baseRefName: "main",
      },
      {
        number: 4,
        title: "Closed one",
        state: "closed",
        isDraft: false,
        url: "https://example.com/4",
        headRefName: "feat/d",
        baseRefName: "main",
      },
      {
        number: 5,
        title: "Bad",
        state: "UNKNOWN",
        isDraft: false,
        url: "https://example.com/5",
        headRefName: "feat/e",
        baseRefName: "main",
      },
    ]),
  );
  assert.deepEqual(
    prs.map((pr) => [pr.number, pr.state, pr.headRefName, pr.baseRefName]),
    [
      [1, "open", "feat/a", "main"],
      [2, "draft", "feat/b", "main"],
      [3, "merged", "feat/c", "main"],
      [4, "closed", "feat/d", "main"],
    ],
  );
  assert.deepEqual(parsePullRequests("not-json"), []);
  assert.deepEqual(parsePullRequests(""), []);
  assert.deepEqual(
    parsePullRequests(
      JSON.stringify([
        {
          number: 9,
          title: "No base",
          state: "OPEN",
          isDraft: false,
          url: "https://example.com/9",
          headRefName: "feat/z",
        },
      ]),
    ),
    [],
  );
});

test("pullRequestsForBranch matches exact and owner: prefix", () => {
  const prs = parsePullRequests(
    JSON.stringify([
      {
        number: 1,
        title: "A",
        state: "OPEN",
        isDraft: false,
        url: "https://example.com/1",
        headRefName: "feat/x",
        baseRefName: "main",
      },
      {
        number: 2,
        title: "B",
        state: "MERGED",
        isDraft: false,
        url: "https://example.com/2",
        headRefName: "jchula:feat/x",
        baseRefName: "main",
      },
      {
        number: 3,
        title: "C",
        state: "CLOSED",
        isDraft: false,
        url: "https://example.com/3",
        headRefName: "feat/y",
        baseRefName: "main",
      },
    ]),
  );
  assert.deepEqual(
    pullRequestsForBranch(prs, "feat/x").map((pr) => pr.number),
    [1, 2],
  );
  assert.deepEqual(
    pullRequestsForBranch(prs, "jchula:feat/x").map((pr) => pr.number),
    [1, 2],
  );
  assert.deepEqual(
    pullRequestsForBranch(prs, "feat/y").map((pr) => pr.number),
    [3],
  );
  assert.deepEqual(pullRequestsForBranch(prs, "missing"), []);
});

test("pullRequestsForBase matches exact and owner: prefix", () => {
  const prs = parsePullRequests(
    JSON.stringify([
      {
        number: 1,
        title: "Into main",
        state: "OPEN",
        isDraft: false,
        url: "https://example.com/1",
        headRefName: "feat/x",
        baseRefName: "main",
      },
      {
        number: 2,
        title: "Into develop",
        state: "MERGED",
        isDraft: false,
        url: "https://example.com/2",
        headRefName: "feat/y",
        baseRefName: "develop",
      },
      {
        number: 3,
        title: "Fork base prefix",
        state: "CLOSED",
        isDraft: false,
        url: "https://example.com/3",
        headRefName: "feat/z",
        baseRefName: "org:main",
      },
      {
        number: 4,
        title: "Other",
        state: "OPEN",
        isDraft: false,
        url: "https://example.com/4",
        headRefName: "feat/w",
        baseRefName: "release",
      },
    ]),
  );
  assert.deepEqual(
    pullRequestsForBase(prs, "main").map((pr) => pr.number),
    [1, 3],
  );
  assert.deepEqual(
    pullRequestsForBase(prs, "org:main").map((pr) => pr.number),
    [1, 3],
  );
  assert.deepEqual(
    pullRequestsForBase(prs, "develop").map((pr) => pr.number),
    [2],
  );
  assert.deepEqual(pullRequestsForBase(prs, "missing"), []);
});

test("isBranchMerged requires merged and no open/draft", () => {
  const prs = parsePullRequests(
    JSON.stringify([
      {
        number: 1,
        title: "Merged",
        state: "MERGED",
        isDraft: false,
        url: "https://example.com/1",
        headRefName: "feat/done",
        baseRefName: "main",
      },
      {
        number: 2,
        title: "Closed prior",
        state: "CLOSED",
        isDraft: false,
        url: "https://example.com/2",
        headRefName: "feat/done",
        baseRefName: "main",
      },
      {
        number: 3,
        title: "Open again",
        state: "OPEN",
        isDraft: false,
        url: "https://example.com/3",
        headRefName: "feat/active",
        baseRefName: "main",
      },
      {
        number: 4,
        title: "Also merged",
        state: "MERGED",
        isDraft: false,
        url: "https://example.com/4",
        headRefName: "feat/active",
        baseRefName: "main",
      },
      {
        number: 5,
        title: "Only closed",
        state: "CLOSED",
        isDraft: false,
        url: "https://example.com/5",
        headRefName: "feat/closed",
        baseRefName: "main",
      },
      {
        number: 6,
        title: "Draft",
        state: "OPEN",
        isDraft: true,
        url: "https://example.com/6",
        headRefName: "owner:feat/draft",
        baseRefName: "main",
      },
      {
        number: 7,
        title: "Merged draft branch",
        state: "MERGED",
        isDraft: false,
        url: "https://example.com/7",
        headRefName: "feat/draft",
        baseRefName: "main",
      },
    ]),
  );
  assert.equal(isBranchMerged(prs, "feat/done"), true);
  assert.equal(isBranchMerged(prs, "feat/active"), false);
  assert.equal(isBranchMerged(prs, "feat/closed"), false);
  assert.equal(isBranchMerged(prs, "feat/draft"), false);
  assert.equal(isBranchMerged(prs, "missing"), false);
});
