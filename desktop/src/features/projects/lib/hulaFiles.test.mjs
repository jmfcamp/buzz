import assert from "node:assert/strict";
import test from "node:test";

import {
  HULA_STATUS_ARGV,
  HULA_WORKTREE_STATUS_ARGV,
  hulaBlobText,
  hulaCommitByHash,
  hulaCommitDiffArgv,
  hulaAllCommitsArgv,
  hulaCommitListArgv,
  hulaCommitLogArgv,
  hulaGitOutputWasCut,
  HULA_GIT_OUTPUT_CAP,
  hulaOneCommitArgv,
  hulaDirectoryEntries,
  hulaFilesBreadcrumb,
  hulaFilesDirectoryAt,
  hulaFilesEntryPath,
  hulaFilesErrorMessage,
  hulaFilesInsideRoot,
  hulaFilesParent,
  hulaFilesRootPath,
  hulaGitRef,
  hulaReviewDiffArgv,
  hulaTwoDotDiffArgv,
  hulaOpenFilePath,
  hulaRelativeFiles,
  hulaShowFileArgv,
  hulaTrackedTreeArgv,
  listHulaDirectory,
  loadHulaAllCommits,
  loadHulaCommit,
  loadHulaCommitDiff,
  loadHulaFilesSnapshot,
  loadHulaReviewDiff,
  hulaFilesUseWorktreeDisk,
  hulaGitStatusForPath,
  mergeHulaDiskFilesWithGit,
  parseGitStatusOverlay,
  parseGitDirtyPaths,
  parseGitMediumNameLog,
  parseGitTrackedPaths,
  parseUnifiedDiff,
} from "./hulaFiles.ts";

const PROJECT = "Hula/projects/claimminer";
const DESKTOP = "Hula/projects/claimminer/desktop";

test("the project directory is the file root", () => {
  assert.equal(hulaFilesRootPath(PROJECT, null), PROJECT);
  assert.equal(hulaFilesRootPath(PROJECT, PROJECT), PROJECT);
});

test("a selected codebase lists that directory", () => {
  assert.equal(hulaFilesRootPath(PROJECT, DESKTOP), DESKTOP);
  assert.equal(
    hulaFilesRootPath(PROJECT, "Hula/worktrees/claimminer-desktop"),
    "Hula/worktrees/claimminer-desktop",
  );
});

test("a codebase path outside Hula falls back to the project directory", () => {
  assert.equal(
    hulaFilesRootPath(PROJECT, "/Users/jm/Documents/Hula/projects/claimminer"),
    PROJECT,
  );
  assert.equal(hulaFilesRootPath("", DESKTOP), null);
});

test("a listed folder opens only inside the file root", () => {
  assert.equal(
    hulaFilesEntryPath(PROJECT, PROJECT, {
      name: "desktop",
      path: DESKTOP,
    }),
    DESKTOP,
  );
  assert.equal(
    hulaFilesEntryPath(DESKTOP, DESKTOP, {
      name: "src",
      path: `${DESKTOP}/src`,
    }),
    `${DESKTOP}/src`,
  );
  assert.equal(
    hulaFilesEntryPath(PROJECT, PROJECT, {
      name: "desktop",
      path: "Hula/projects/other/desktop",
    }),
    null,
  );
  assert.equal(
    hulaFilesEntryPath(PROJECT, PROJECT, {
      name: "..",
      path: "Hula/projects",
    }),
    null,
  );
  assert.equal(hulaFilesInsideRoot(DESKTOP, PROJECT), null);
});

test("breadcrumbs stay inside the selected directory", () => {
  assert.deepEqual(hulaFilesBreadcrumb(PROJECT, `${DESKTOP}/src`), [
    "desktop",
    "src",
  ]);
  assert.deepEqual(hulaFilesBreadcrumb(DESKTOP, DESKTOP), []);
  assert.equal(hulaFilesDirectoryAt(PROJECT, ["desktop"]), DESKTOP);
  assert.equal(hulaFilesParent(PROJECT, `${DESKTOP}/src`), DESKTOP);
  assert.equal(hulaFilesParent(PROJECT, PROJECT), null);
  assert.equal(hulaFilesDirectoryAt(PROJECT, [".."]), null);
});

test("directory entries keep real names and put folders first", () => {
  assert.deepEqual(
    hulaDirectoryEntries({
      entries: [
        { name: "README.md", path: `${PROJECT}/README.md`, type: "file" },
        { name: "..", path: "Hula/projects", type: "directory" },
        { name: "src/main.ts", path: `${PROJECT}/src/main.ts`, type: "file" },
        { name: "desktop", path: DESKTOP, type: "directory" },
        { name: "notes.txt", path: `${PROJECT}/notes.txt`, type: "file" },
      ],
    }).map((entry) => entry.name),
    ["desktop", "notes.txt", "README.md"],
  );
});

test("one folder is listed from OpenClaw", async () => {
  const calls = [];
  const entries = await listHulaDirectory(PROJECT, async (name, arguments_) => {
    calls.push({ name, arguments_ });
    return {
      isError: false,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              entries: [
                {
                  name: "README.md",
                  path: `${PROJECT}/README.md`,
                  type: "file",
                },
                { name: "desktop", path: DESKTOP, type: "directory" },
              ],
            }),
          },
        ],
      },
    };
  });
  assert.deepEqual(calls, [
    {
      name: "list_directory",
      arguments_: { path: PROJECT, depth: 1, namesOnly: true },
    },
  ]);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["desktop", "README.md"],
  );
});

test("a file tree keeps nested files and drops paths outside the root", () => {
  assert.deepEqual(
    hulaRelativeFiles(PROJECT, [
      {
        name: "README.md",
        path: `${PROJECT}/README.md`,
        type: "file",
        size: 12,
      },
      {
        name: "desktop",
        path: DESKTOP,
        type: "directory",
        size: null,
        children: [
          {
            name: "main.ts",
            path: `${DESKTOP}/main.ts`,
            type: "file",
            size: 4,
          },
        ],
      },
      {
        name: "escape",
        path: "Hula/other/escape",
        type: "file",
        size: 1,
      },
    ]),
    [
      { path: "README.md", size: 12 },
      { path: "desktop/main.ts", size: 4 },
    ],
  );
  assert.equal(
    hulaOpenFilePath(PROJECT, "desktop/main.ts"),
    `${DESKTOP}/main.ts`,
  );
  assert.equal(hulaOpenFilePath(PROJECT, "../secret"), null);
});

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const ADA_TIME = Math.floor(
  Date.parse("Mon Aug 31 13:31:33 2026 -0400") / 1000,
);

test("medium git log keeps the newest touch and skips deletions", () => {
  const commits =
    parseGitMediumNameLog(`commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Author: Ada Lovelace <ada@example.com>
Date:   Mon Aug 31 13:31:33 2026 -0400

    Add the desktop app

    Body line that is not a file

M	desktop/main.ts
R100	old.ts	"notes file.md"
D	gone.txt

commit bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
Author: Grace Hopper <grace@example.com>
Date:   Sun Aug 30 09:00:00 2026 -0400

    Add the readme

A	README.md
M	desktop/main.ts
`);
  assert.equal(commits.length, 2);
  assert.equal(commits[0].shortHash, "aaaaaaa");
  assert.equal(commits[0].authorName, "Ada Lovelace");
  assert.equal(commits[0].authorEmail, "ada@example.com");
  assert.equal(commits[0].subject, "Add the desktop app");
  assert.equal(commits[0].body, "Body line that is not a file");
  assert.deepEqual(commits[0].files, ["desktop/main.ts", "notes file.md"]);
  assert.equal(commits[0].timestamp, ADA_TIME);
  assert.equal(commits[1].subject, "Add the readme");
  assert.deepEqual(
    parseGitTrackedPaths('README.md\n"notes file.md"\n../secret\n'),
    ["README.md", "notes file.md"],
  );
  assert.deepEqual(
    [...parseGitDirtyPaths(' M README.md\nR  old.ts -> "notes file.md"\n')],
    ["README.md", "notes file.md"],
  );
});

test("HEAD with a directory listing uses the worktree on disk", async () => {
  assert.equal(
    hulaFilesUseWorktreeDisk("HEAD", async () => ({
      isError: false,
      result: null,
    })),
    true,
  );
  assert.equal(
    hulaFilesUseWorktreeDisk("main", async () => ({
      isError: false,
      result: null,
    })),
    false,
  );
  assert.equal(hulaFilesUseWorktreeDisk("HEAD", null), false);
  const calls = [];
  const snapshot = await loadHulaFilesSnapshot(
    PROJECT,
    async (argv, cwd) => {
      calls.push({ argv: [...argv], cwd });
      if (argv[1] === "status") {
        return {
          stdout: " M README.md\n?? scratch.txt\n!! docs/buzz-review-test.md\n",
          stderr: "",
          exitCode: 0,
        };
      }
      if (argv[1] === "log" && argv.includes("--name-status")) {
        return {
          stdout: `commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Author: Ada Lovelace <ada@example.com>
Date:   Mon Aug 31 13:31:33 2026 -0400

    Add the desktop app

M	desktop/main.ts
`,
          stderr: "",
          exitCode: 0,
        };
      }
      if (argv[1] === "log") {
        return {
          stdout: `commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Author: Ada Lovelace <ada@example.com>
Date:   Mon Aug 31 13:31:33 2026 -0400

    Add the desktop app
`,
          stderr: "",
          exitCode: 0,
        };
      }
      return { stdout: "", stderr: "unexpected", exitCode: 1 };
    },
    {
      ref: "HEAD",
      list: async (name, arguments_) => {
        calls.push({ name, arguments_ });
        return {
          isError: false,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  entries: [
                    {
                      name: "README.md",
                      path: `${PROJECT}/README.md`,
                      type: "file",
                      size: 20,
                    },
                    {
                      name: "scratch.txt",
                      path: `${PROJECT}/scratch.txt`,
                      type: "file",
                      size: 4,
                    },
                    {
                      name: "docs",
                      path: `${PROJECT}/docs`,
                      type: "directory",
                      children: [
                        {
                          name: "buzz-review-test.md",
                          path: `${PROJECT}/docs/buzz-review-test.md`,
                          type: "file",
                          size: 12,
                        },
                      ],
                    },
                    {
                      name: "desktop",
                      path: DESKTOP,
                      type: "directory",
                      children: [
                        {
                          name: "main.ts",
                          path: `${DESKTOP}/main.ts`,
                          type: "file",
                          size: 8,
                        },
                      ],
                    },
                  ],
                }),
              },
            ],
          },
        };
      },
    },
  );
  const argvCalls = calls.filter((call) => call.argv);
  const listCalls = calls.filter((call) => call.name === "list_directory");
  assert.deepEqual(
    argvCalls.map((call) => call.argv),
    [
      hulaCommitLogArgv("HEAD"),
      hulaCommitListArgv("HEAD"),
      [...HULA_WORKTREE_STATUS_ARGV],
    ],
  );
  assert.equal(argvCalls[0].cwd, PROJECT);
  assert.deepEqual(listCalls, [
    {
      name: "list_directory",
      arguments_: { path: PROJECT, depth: 32, namesOnly: false },
    },
  ]);
  assert.deepEqual(
    snapshot.files.map((file) => [file.path, file.gitStatus, file.size]),
    [
      ["desktop/main.ts", "tracked", 8],
      ["docs/buzz-review-test.md", "ignored", 12],
      ["README.md", "modified", 20],
      ["scratch.txt", "untracked", 4],
    ],
  );
  assert.equal(snapshot.files[0].kind, "blob");
  assert.equal(snapshot.files[0].previewContent, null);
  assert.equal(snapshot.latestCommit?.subject, "Add the desktop app");
  assert.equal(snapshot.contributors[0]?.name, "Ada Lovelace");
  assert.equal(snapshot.contributors[0]?.email, "ada@example.com");
  assert.equal(snapshot.contributors[0]?.commitCount, 1);
  assert.equal(snapshot.contributors[0]?.lastCommitAt, ADA_TIME);
  assert.equal(snapshot.files[0].latestCommit?.subject, "Add the desktop app");
  assert.equal(snapshot.files[1].latestCommit, null);
  assert.equal(snapshot.files[3].latestCommit, null);
  assert.equal(
    hulaCommitByHash(snapshot, "a".repeat(40))?.subject,
    "Add the desktop app",
  );
});

test("a branch ref keeps the tracked tree, not the worktree", async () => {
  const calls = [];
  const snapshot = await loadHulaFilesSnapshot(
    PROJECT,
    async (argv, cwd) => {
      calls.push({ argv: [...argv], cwd });
      if (argv[1] === "diff") {
        return {
          stdout: "README.md\ndesktop/main.ts\n",
          stderr: "",
          exitCode: 0,
        };
      }
      if (argv[1] === "log" && argv.includes("--name-status")) {
        return {
          stdout: `commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Author: Ada Lovelace <ada@example.com>
Date:   Mon Aug 31 13:31:33 2026 -0400

    Add the desktop app

M	desktop/main.ts
`,
          stderr: "",
          exitCode: 0,
        };
      }
      if (argv[1] === "log") {
        return {
          stdout: `commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Author: Ada Lovelace <ada@example.com>
Date:   Mon Aug 31 13:31:33 2026 -0400

    Add the desktop app
`,
          stderr: "",
          exitCode: 0,
        };
      }
      return { stdout: " M README.md\n", stderr: "", exitCode: 0 };
    },
    {
      ref: "side",
      list: async (name, arguments_) => {
        calls.push({ name, arguments_ });
        return {
          isError: false,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  entries: [
                    {
                      name: "README.md",
                      path: `${PROJECT}/README.md`,
                      type: "file",
                      size: 20,
                    },
                    {
                      name: "scratch.txt",
                      path: `${PROJECT}/scratch.txt`,
                      type: "file",
                      size: 4,
                    },
                    {
                      name: "desktop",
                      path: DESKTOP,
                      type: "directory",
                      children: [
                        {
                          name: "main.ts",
                          path: `${DESKTOP}/main.ts`,
                          type: "file",
                          size: 8,
                        },
                      ],
                    },
                  ],
                }),
              },
            ],
          },
        };
      },
    },
  );
  const argvCalls = calls.filter((call) => call.argv);
  assert.deepEqual(argvCalls[0].argv, hulaTrackedTreeArgv("side", EMPTY_TREE));
  assert.deepEqual(
    argvCalls.map((call) => call.argv).find((argv) => argv[1] === "status"),
    [...HULA_STATUS_ARGV],
  );
  assert.deepEqual(
    snapshot.files.map((file) => file.path),
    ["README.md", "desktop/main.ts"],
  );
  assert.equal(snapshot.files[0].gitStatus, undefined);
  assert.equal(snapshot.files[0].size, null);
  assert.equal(snapshot.files[1].size, 8);
});

test("disk entries merge with a git status overlay", () => {
  const overlay = parseGitStatusOverlay(
    ' M README.md\n?? scratch.txt\n!! docs/buzz-review-test.md\n!! build/\nR  old.ts -> "notes file.md"\n',
  );
  assert.equal(overlay.byPath.get("README.md"), "modified");
  assert.equal(overlay.byPath.get("scratch.txt"), "untracked");
  assert.equal(overlay.byPath.get("docs/buzz-review-test.md"), "ignored");
  assert.equal(overlay.byPath.get("notes file.md"), "modified");
  assert.deepEqual(overlay.ignoredDirs, ["build"]);
  assert.equal(hulaGitStatusForPath("build/out.js", overlay), "ignored");
  assert.equal(hulaGitStatusForPath("desktop/main.ts", overlay), "tracked");
  const commits =
    parseGitMediumNameLog(`commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Author: Ada Lovelace <ada@example.com>
Date:   Mon Aug 31 13:31:33 2026 -0400

    Add the desktop app

M	desktop/main.ts
`);
  const merged = mergeHulaDiskFilesWithGit(
    [
      { path: "README.md", size: 20 },
      { path: "scratch.txt", size: 4 },
      { path: "docs/buzz-review-test.md", size: 12 },
      { path: "desktop/main.ts", size: 8 },
      { path: "build/out.js", size: 1 },
    ],
    commits,
    overlay,
  );
  assert.deepEqual(
    merged.map((file) => [
      file.path,
      file.gitStatus,
      file.latestCommit?.shortHash ?? null,
    ]),
    [
      ["README.md", "modified", null],
      ["scratch.txt", "untracked", null],
      ["docs/buzz-review-test.md", "ignored", null],
      ["desktop/main.ts", "tracked", "aaaaaaa"],
      ["build/out.js", "ignored", null],
    ],
  );
});
test("a failed git log still returns the tracked files", async () => {
  const snapshot = await loadHulaFilesSnapshot(PROJECT, async (argv) => {
    if (argv[1] === "diff") {
      return { stdout: "README.md\n", stderr: "", exitCode: 0 };
    }
    throw new Error("git log flag not allowed: --format=%s");
  });
  assert.equal(snapshot.latestCommit, null);
  assert.deepEqual(snapshot.contributors, []);
  assert.deepEqual(
    snapshot.files.map((file) => file.path),
    ["README.md"],
  );
  assert.equal(snapshot.files[0].size, null);
});

test("a failed tree read keeps the git error", async () => {
  await assert.rejects(
    () =>
      loadHulaFilesSnapshot(PROJECT, async () => ({
        stdout: "",
        stderr: "bad object",
        exitCode: 128,
      })),
    /bad object/,
  );
});

test("opening a file reads the committed blob", () => {
  assert.deepEqual(hulaShowFileArgv("HEAD", "desktop/main.ts"), [
    "git",
    "show",
    "HEAD:desktop/main.ts",
  ]);
  assert.equal(hulaShowFileArgv("HEAD", "../secret"), null);
  assert.equal(hulaGitRef("  "), "HEAD");
  assert.throws(() => hulaGitRef("../main"), /cannot be read/);
  assert.equal(hulaBlobText("hello"), "hello");
  assert.equal(hulaBlobText("a\0b"), null);
  assert.equal(hulaBlobText("x".repeat(64 * 1024 + 1)), null);
});

test("a failed listing keeps the OpenClaw error", async () => {
  await assert.rejects(
    () =>
      listHulaDirectory(PROJECT, async () => ({
        isError: true,
        result: {
          content: [{ type: "text", text: "permission denied" }],
        },
      })),
    /permission denied/,
  );
  assert.equal(
    hulaFilesErrorMessage(
      new Error("Not connected — no OpenClaw workspace grant is stored."),
    ),
    "Connect OpenClaw, then open the files.",
  );
});

const COMMIT = "a".repeat(40);
const EMPTY_TREE_SHA256 =
  "6ef19b41225c5369f1c104d45d8d85efa9b057b53b14b4b9b939dd74decc5321";
const ONE_PATCH = `diff --git a/README.md b/README.md
index 111..222 100644
--- a/README.md
+++ b/README.md
@@ -1 +1,2 @@
 hello
+world
diff --git a/old.ts b/new.ts
similarity index 90%
rename from old.ts
rename to new.ts
--- a/old.ts
+++ b/new.ts
@@ -1 +1 @@
-old
+new
diff --git "a/my notes.md" "b/my notes.md"
--- "a/my notes.md"
+++ "b/my notes.md"
@@ -0,0 +1 @@
+note
`;
const ONE_LOG = `commit ${COMMIT}
Author: Ada Lovelace <ada@example.com>
Date:   Mon Aug 31 13:31:33 2026 -0400

    Add the desktop app

    Body line that is not a file

    Second paragraph
`;

test("a unified diff names each file and counts its lines", () => {
  const diff = parseUnifiedDiff(ONE_PATCH);
  assert.deepEqual(
    diff.files.map((file) => file.path),
    ["README.md", "new.ts", "my notes.md"],
  );
  assert.equal(diff.files[0].additions, 1);
  assert.equal(diff.files[0].deletions, 0);
  assert.equal(diff.files[1].additions, 1);
  assert.equal(diff.files[1].deletions, 1);
  assert.equal(diff.additions, 3);
  assert.equal(diff.deletions, 1);
  assert.equal(diff.files[0].truncated, false);
  assert.match(diff.files[0].patch, /^diff --git a\/README.md b\/README.md/);
});

test("a long patch stops at 2000 lines", () => {
  const lines = [
    "diff --git a/big.txt b/big.txt",
    "--- a/big.txt",
    "+++ b/big.txt",
  ];
  for (let index = 0; index < 2100; index += 1) lines.push(`+line ${index}`);
  const diff = parseUnifiedDiff(`${lines.join("\n")}\n`);
  assert.equal(diff.files[0].truncated, true);
  assert.equal(diff.files[0].patch.split("\n").length, 2000);
});

test("one commit reads the medium log", async () => {
  const calls = [];
  const commit = await loadHulaCommit(PROJECT, COMMIT, async (argv, cwd) => {
    calls.push({ argv: [...argv], cwd });
    return { stdout: ONE_LOG, stderr: "", exitCode: 0 };
  });
  assert.deepEqual(calls[0].argv, hulaOneCommitArgv(COMMIT));
  assert.equal(calls[0].cwd, PROJECT);
  assert.equal(commit?.subject, "Add the desktop app");
  assert.equal(commit?.authorName, "Ada Lovelace");
  assert.equal(
    await loadHulaCommit(PROJECT, COMMIT, async () => ({
      stdout: "",
      stderr: "missing",
      exitCode: 128,
    })),
    null,
  );
});

test("a parent diff is the commit patch", async () => {
  const calls = [];
  const diff = await loadHulaCommitDiff(PROJECT, COMMIT, async (argv) => {
    calls.push(argv[1]);
    if (argv[1] === "log") return { stdout: ONE_LOG, stderr: "", exitCode: 0 };
    return { stdout: ONE_PATCH, stderr: "", exitCode: 0 };
  });
  assert.deepEqual(calls, ["diff", "log"]);
  assert.equal(diff.files[0].path, "README.md");
  assert.equal(
    diff.commitBody,
    "Body line that is not a file\n\nSecond paragraph",
  );
});

test("a root commit falls back to the empty tree", async () => {
  const calls = [];
  const diff = await loadHulaCommitDiff(PROJECT, COMMIT, async (argv) => {
    calls.push([...argv]);
    if (argv[1] === "log") return { stdout: ONE_LOG, stderr: "", exitCode: 0 };
    if (argv.includes(`${COMMIT}~1`)) {
      return {
        stdout: "",
        stderr: `fatal: bad revision '${COMMIT}~1'`,
        exitCode: 128,
      };
    }
    if (argv.includes(EMPTY_TREE)) {
      return { stdout: "", stderr: "fatal: bad revision", exitCode: 128 };
    }
    return { stdout: ONE_PATCH, stderr: "", exitCode: 0 };
  });
  assert.deepEqual(calls[0], hulaCommitDiffArgv(`${COMMIT}~1`, COMMIT));
  assert.deepEqual(calls[1], hulaOneCommitArgv(COMMIT));
  assert.deepEqual(calls[2], hulaCommitDiffArgv(EMPTY_TREE, COMMIT));
  assert.deepEqual(calls[3], hulaCommitDiffArgv(EMPTY_TREE_SHA256, COMMIT));
  assert.equal(diff.files[0].path, "README.md");
  assert.equal(hulaGitRef(`${COMMIT}~1`), `${COMMIT}~1`);
});

test("a diff failure that is not a missing parent stays an error", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      loadHulaCommitDiff(PROJECT, COMMIT, async (argv) => {
        calls += 1;
        if (argv[1] === "log") return { stdout: "", stderr: "", exitCode: 0 };
        return { stdout: "", stderr: "disk full", exitCode: 1 };
      }),
    /disk full/,
  );
  assert.equal(calls, 2);
});

test("contributors count the full log and rank by commit count", async () => {
  const later = ADA_TIME + 86_400;
  const snapshot = await loadHulaFilesSnapshot(PROJECT, async (argv) => {
    if (argv[1] === "diff") {
      return { stdout: "README.md\n", stderr: "", exitCode: 0 };
    }
    if (argv[1] === "log") {
      return {
        stdout: `commit cccccccccccccccccccccccccccccccccccccccc
Author: Grace Hopper <grace@example.com>
Date:   Tue Sep 1 13:31:33 2026 -0400

    Later note

M	README.md

commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Author: Ada Lovelace <ada@example.com>
Date:   Mon Aug 31 13:31:33 2026 -0400

    Add the desktop app

M	README.md

commit bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
Author: Ada Lovelace <ada@example.com>
Date:   Sun Aug 30 09:00:00 2026 -0400

    First note

A	README.md
`,
        stderr: "",
        exitCode: 0,
      };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  });
  assert.equal(snapshot.contributors[0]?.name, "Ada Lovelace");
  assert.equal(snapshot.contributors[0]?.commitCount, 2);
  assert.equal(snapshot.contributors[0]?.lastCommitAt, ADA_TIME);
  assert.equal(snapshot.contributors[1]?.name, "Grace Hopper");
  assert.equal(snapshot.contributors[1]?.commitCount, 1);
  assert.equal(snapshot.contributors[1]?.lastCommitAt, later);
  assert.equal(snapshot.commits.length, 3);
});

test("all commits reads every local ref and a failed read throws", async () => {
  assert.deepEqual(hulaAllCommitsArgv(), [
    "git",
    "log",
    "--pretty=medium",
    "--no-color",
    "--all",
  ]);
  const calls = [];
  const loaded = await loadHulaAllCommits(PROJECT, async (argv) => {
    calls.push([...argv]);
    return {
      stdout: `commit ${"ab".repeat(20)}
Author: Ada Lovelace <ada@example.com>
Date:   Mon Aug 31 13:31:33 2026 -0400

    On another branch
`,
      stderr: "",
      exitCode: 0,
      truncated: true,
    };
  });
  assert.deepEqual(calls, [hulaAllCommitsArgv()]);
  assert.equal(loaded.commits.length, 1);
  assert.equal(loaded.commits[0].subject, "On another branch");
  assert.equal(loaded.truncated, true);
  await assert.rejects(
    () =>
      loadHulaAllCommits(PROJECT, async () => ({
        stdout: "",
        stderr: "",
        exitCode: 1,
      })),
    /Could not read every commit/,
  );
});

test("the commit list keeps every commit on the ref", async () => {
  assert.deepEqual(hulaCommitListArgv("main"), [
    "git",
    "log",
    "--pretty=medium",
    "--no-color",
    "main",
  ]);
  const stdout = Array.from({ length: 51 }, (_, index) => {
    const number = 51 - index;
    const hash = number.toString(16).padStart(40, "0");
    return `commit ${hash}
Author: Person ${number} <p${number}@example.com>
Date:   Wed Aug 12 12:00:00 2026 -0400

    Subject ${number}
`;
  }).join("\n");
  const snapshot = await loadHulaFilesSnapshot(PROJECT, async (argv) => {
    if (argv[1] === "diff") {
      return { stdout: "README.md\n", stderr: "", exitCode: 0 };
    }
    if (argv[1] === "log" && argv.includes("--name-status")) {
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    if (argv[1] === "log") return { stdout, stderr: "", exitCode: 0 };
    return { stdout: "", stderr: "", exitCode: 0 };
  });
  assert.equal(snapshot.commits.length, 51);
  assert.equal(snapshot.commits[0].subject, "Subject 51");
  assert.equal(snapshot.commits[50].subject, "Subject 1");
  assert.equal(snapshot.contributors.length, 50);
  assert.equal(snapshot.historyTruncated, undefined);
});

test("a cut commit read keeps the commits it returned", async () => {
  assert.equal(hulaGitOutputWasCut("short"), false);
  assert.equal(hulaGitOutputWasCut("short", true), true);
  assert.equal(hulaGitOutputWasCut("a".repeat(HULA_GIT_OUTPUT_CAP)), true);
  const snapshot = await loadHulaFilesSnapshot(PROJECT, async (argv) => {
    if (argv[1] === "diff") return { stdout: "", stderr: "", exitCode: 0 };
    if (argv[1] === "log" && !argv.includes("--name-status")) {
      return {
        stdout: `commit ${"ab".repeat(20)}
Author: Ada Lovelace <ada@example.com>
Date:   Mon Aug 31 13:31:33 2026 -0400

    Kept
`,
        stderr: "",
        exitCode: 0,
        truncated: true,
      };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  });
  assert.equal(snapshot.historyTruncated, true);
  assert.equal(snapshot.commits.length, 1);
  assert.equal(snapshot.commits[0].subject, "Kept");
});

test("a failed commit list falls back to the name-status log", async () => {
  const snapshot = await loadHulaFilesSnapshot(PROJECT, async (argv) => {
    if (argv[1] === "diff") {
      return { stdout: "README.md\n", stderr: "", exitCode: 0 };
    }
    if (argv.includes("--name-status")) {
      return {
        stdout: `commit ${"cd".repeat(20)}
Author: Ada Lovelace <ada@example.com>
Date:   Mon Aug 31 13:31:33 2026 -0400

    From the file log

M	README.md
`,
        stderr: "",
        exitCode: 0,
      };
    }
    if (argv[1] === "log") {
      return { stdout: "", stderr: "list failed", exitCode: 1 };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  });
  assert.equal(snapshot.commits[0]?.subject, "From the file log");
  assert.equal(snapshot.files[0].latestCommit?.subject, "From the file log");
  assert.equal(snapshot.historyTruncated, undefined);
});

test("a review diff tries three-dot, then two-dot", async () => {
  assert.deepEqual(hulaReviewDiffArgv("main", "feature"), [
    "git",
    "diff",
    "--no-color",
    "--find-renames",
    "--find-copies",
    "--unified=80",
    "main...feature",
  ]);
  assert.throws(() => hulaGitRef("main...feature"), /cannot be read/);
  const calls = [];
  const diff = await loadHulaReviewDiff(
    PROJECT,
    "main",
    "feature",
    async (argv, cwd) => {
      calls.push({ argv: [...argv], cwd });
      if (String(argv[6]).includes("...")) {
        return {
          stdout: "",
          stderr: "fatal: bad revision",
          exitCode: 128,
        };
      }
      return { stdout: ONE_PATCH, stderr: "", exitCode: 0 };
    },
  );
  assert.deepEqual(calls[0].argv, hulaReviewDiffArgv("main", "feature"));
  assert.deepEqual(calls[1].argv, hulaTwoDotDiffArgv("main", "feature"));
  assert.equal(calls[0].cwd, PROJECT);
  assert.equal(diff.files[0].path, "README.md");
  const once = [];
  await loadHulaReviewDiff(PROJECT, "main", "feature", async (argv) => {
    once.push(argv[6]);
    return { stdout: ONE_PATCH, stderr: "", exitCode: 0 };
  });
  assert.deepEqual(once, ["main...feature"]);
});
