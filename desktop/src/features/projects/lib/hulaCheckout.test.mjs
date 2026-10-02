import assert from "node:assert/strict";
import test from "node:test";

import {
  HULA_BRANCHES_ARGV,
  HULA_HEAD_ARGV,
  branchFromGitStatus,
  hulaCheckoutRows,
  loadHulaBranches,
  loadHulaHeadBranch,
  parseHulaBranchNames,
  parseWorktreePorcelain,
} from "./hulaCheckout.ts";

const PROJECT = "Hula/projects/claimminer";

test("git status reports the checked-out branch", () => {
  assert.equal(branchFromGitStatus("## main...origin/main\n M file\n"), "main");
  assert.equal(branchFromGitStatus("## feature/foo\n"), "feature/foo");
  assert.equal(branchFromGitStatus("## HEAD (no branch)\n"), null);
});

test("worktree porcelain keeps path, head, and branch", () => {
  const text = [
    "worktree /home/ubuntu/.openclaw/workspace/Hula/projects/claimminer",
    "HEAD abc",
    "branch refs/heads/main",
    "",
    "worktree /home/ubuntu/.openclaw/workspace/Hula/.worktrees/bill-21",
    "HEAD def",
    "branch refs/heads/handle/bill-21-slug",
    "",
    "worktree /tmp/detached",
    "HEAD eee",
    "detached",
    "",
  ].join("\n");
  const records = parseWorktreePorcelain(text);
  assert.equal(records.length, 3);
  assert.equal(records[0].branch, "main");
  assert.equal(records[1].branch, "handle/bill-21-slug");
  assert.equal(records[2].detached, true);
  assert.equal(records[2].branch, null);
});

test("branch names keep readable heads and drop the rest", () => {
  assert.deepEqual(
    parseHulaBranchNames("main\n\nfeature/foo\n../secret\nfeature/foo\n"),
    ["main", "feature/foo"],
  );
});

test("branch and head reads use the checkout and do not move it", async () => {
  const calls = [];
  const exec = async (argv, cwd) => {
    calls.push({ argv: [...argv], cwd });
    if (argv[1] === "for-each-ref") {
      return { stdout: "main\nfeature/foo\n", stderr: "", exitCode: 0 };
    }
    return { stdout: "## main...origin/main\n", stderr: "", exitCode: 0 };
  };
  assert.deepEqual(await loadHulaBranches(PROJECT, exec), [
    "main",
    "feature/foo",
  ]);
  assert.equal(await loadHulaHeadBranch(PROJECT, exec), "main");
  assert.deepEqual(calls[0].argv, [...HULA_BRANCHES_ARGV]);
  assert.deepEqual(calls[1].argv, [...HULA_HEAD_ARGV]);
  assert.equal(calls[0].cwd, PROJECT);
  assert.equal(
    await loadHulaHeadBranch(PROJECT, async () => ({
      stdout: "## HEAD (no branch)\n",
      stderr: "",
      exitCode: 0,
    })),
    null,
  );
  await assert.rejects(
    () =>
      loadHulaBranches(PROJECT, async () => ({
        stdout: "",
        stderr: "disk full",
        exitCode: 1,
      })),
    /disk full/,
  );
});

test("checkout rows select the member repository and do not describe a checkout command", () => {
  const rows = hulaCheckoutRows([
    {
      repositoryId: "repo-root",
      name: "claimminer",
      hulaPath: "Hula/projects/claimminer",
      worktrees: parseWorktreePorcelain(
        [
          "worktree /home/ubuntu/.openclaw/workspace/Hula/projects/claimminer",
          "HEAD abc",
          "branch refs/heads/main",
          "",
          "worktree /home/ubuntu/.openclaw/workspace/Hula/.worktrees/bill-21",
          "HEAD def",
          "branch refs/heads/side",
          "",
        ].join("\n"),
      ),
    },
    {
      repositoryId: "repo-desktop",
      name: "desktop",
      hulaPath: "Hula/projects/claimminer/desktop",
      worktrees: [
        {
          path: "/home/ubuntu/.openclaw/workspace/Hula/projects/claimminer/desktop",
          head: "fff",
          branch: "dev",
          detached: false,
        },
      ],
    },
  ]);

  assert.deepEqual(
    rows.repos.map((row) => [row.repositoryId, row.name, row.branch]),
    [
      ["repo-root", "claimminer", "main"],
      ["repo-desktop", "desktop", "dev"],
    ],
  );
  assert.deepEqual(rows.worktrees, [
    {
      repositoryId: "repo-root",
      repoName: "claimminer",
      path: "Hula/.worktrees/bill-21",
      branch: "side",
    },
  ]);
});
