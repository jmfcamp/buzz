import assert from "node:assert/strict";
import { test } from "node:test";

import { isAssistantReply } from "./assistantReply.ts";

const jeeves = "a".repeat(64);
test("assistant reply = the assistant writing in a DM", () => {
  assert.equal(isAssistantReply(jeeves, "dm", jeeves), true);
  assert.equal(isAssistantReply(jeeves.toUpperCase(), "dm", jeeves), true);
  assert.equal(isAssistantReply("b".repeat(64), "dm", jeeves), false);
  assert.equal(isAssistantReply(jeeves, "stream", jeeves), false);
  assert.equal(isAssistantReply(jeeves, "dm", null), false);
  assert.equal(isAssistantReply(jeeves, undefined, jeeves), false);
});
