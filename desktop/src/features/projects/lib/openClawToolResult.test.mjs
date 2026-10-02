import assert from "node:assert/strict";
import test from "node:test";

import {
  openClawMissingPath,
  openClawToolJson,
} from "./openClawToolResult.ts";

test("tool text JSON is parsed and a missing path is recognized", () => {
  const result = {
    content: [
      {
        type: "text",
        text: JSON.stringify({ path: "Hula/projects/claimminer", type: "directory" }),
      },
    ],
  };
  assert.deepEqual(openClawToolJson(result), {
    path: "Hula/projects/claimminer",
    type: "directory",
  });
  assert.equal(
    openClawMissingPath({
      content: [{ type: "text", text: "ENOENT: no such file or directory" }],
    }),
    true,
  );
});
