import assert from "node:assert/strict";
import test from "node:test";

import { parseBestieJobActionsFromMessage } from "./parseBestieJobActions.ts";

test("parses bestie-job fence add", () => {
  const actions = parseBestieJobActionsFromMessage(`Ok.
\`\`\`bestie-job
{"op":"add","job":{"title":"Brief","prompt":"Go","schedule":{"kind":"daily","hour":9,"minute":0}}}
\`\`\``);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].op, "add");
  assert.equal(actions[0].job.title, "Brief");
});
