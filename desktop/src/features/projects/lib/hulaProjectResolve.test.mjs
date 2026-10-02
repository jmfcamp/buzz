import assert from "node:assert/strict";
import test from "node:test";

import { resolveHulaProjectDirectory } from "./hulaProjectResolve.ts";

function clientFrom(stats, entries) {
  return {
    async statPath(path) {
      return stats[path] ?? null;
    },
    async listDirectory() {
      return entries;
    },
  };
}

const ROOT = "Hula/projects/claimminer";

test("a file link walks up to the git directory and stats .git", async () => {
  const stats = {
    [`${ROOT}/.git`]: { type: "directory" },
    [`${ROOT}/desktop/.git`]: { type: "file" },
    [`${ROOT}/src/main.ts/.git`]: null,
    [`${ROOT}/src/.git`]: null,
  };
  const resolved = await resolveHulaProjectDirectory(
    "https://porthole.example/?path=Hula/projects/claimminer/src&file=main.ts",
    clientFrom(stats, [
      {
        name: "desktop",
        path: `${ROOT}/desktop`,
        type: "directory",
        children: [],
      },
      {
        name: "src",
        path: `${ROOT}/src`,
        type: "directory",
        children: [
          { name: "main.ts", path: `${ROOT}/src/main.ts`, type: "file" },
        ],
      },
      {
        name: "node_modules",
        path: `${ROOT}/node_modules`,
        type: "directory",
        children: [
          {
            name: "left-pad",
            path: `${ROOT}/node_modules/left-pad`,
            type: "directory",
          },
        ],
      },
    ]),
  );

  assert.equal(resolved.hulaPath, ROOT);
  assert.deepEqual(resolved.repoPaths, [ROOT, `${ROOT}/desktop`]);
});

test("Hula itself and a missing git directory are refused", async () => {
  const empty = clientFrom({}, []);
  await assert.rejects(
    () => resolveHulaProjectDirectory("Hula", empty),
    /inside Hula/,
  );
  await assert.rejects(
    () => resolveHulaProjectDirectory("Hula/projects/claimminer", empty),
    /git repository/,
  );
  await assert.rejects(
    () =>
      resolveHulaProjectDirectory("Hula/projects/claimminer/../../etc", empty),
    /inside Hula/,
  );
});
