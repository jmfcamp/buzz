import assert from "node:assert/strict";
import test from "node:test";

import {
  extractTermSessionCard,
  parseTermSessionCard,
} from "./card.ts";
import {
  clearTermSessionPromptStoreForTests,
  getTermSessionPrompt,
} from "./promptStore.ts";

const valid = {
  hula: "term-session",
  v: 1,
  name: "Thread handoff",
  tool: "claude",
  sid: "sid-1",
  prompt: "Do the work from this thread.",
};

test("parses required term-session fields and stores prompt", () => {
  clearTermSessionPromptStoreForTests();
  const card = parseTermSessionCard(JSON.stringify(valid));
  assert.deepEqual(card, valid);
  assert.equal(getTermSessionPrompt("sid-1"), valid.prompt);
});

test("keeps optional cwd, summary, openclawWorkspace only when present", () => {
  const card = parseTermSessionCard(
    JSON.stringify({
      ...valid,
      cwd: "~/src",
      summary: "one liner",
      openclawWorkspace: true,
    }),
  );
  assert.equal(card?.cwd, "~/src");
  assert.equal(card?.summary, "one liner");
  assert.equal(card?.openclawWorkspace, true);
  assert.equal(
    "openclawWorkspace" in parseTermSessionCard(JSON.stringify(valid)),
    false,
  );
});

test("rejects malformed cards and never requires prompt in render fields", () => {
  assert.equal(parseTermSessionCard("{"), null);
  assert.equal(
    parseTermSessionCard(JSON.stringify({ ...valid, hula: "playground" })),
    null,
  );
  assert.equal(parseTermSessionCard(JSON.stringify({ ...valid, v: 2 })), null);
  assert.equal(
    parseTermSessionCard(JSON.stringify({ ...valid, name: "" })),
    null,
  );
  assert.equal(
    parseTermSessionCard(JSON.stringify({ ...valid, tool: "goose" })),
    null,
  );
  assert.equal(
    parseTermSessionCard(JSON.stringify({ ...valid, prompt: "" })),
    null,
  );
  // Prompt is in the model; Open UI must not rely on it being on the card face.
  const ok = parseTermSessionCard(JSON.stringify(valid));
  assert.equal(typeof ok?.prompt, "string");
  assert.equal(ok?.name, "Thread handoff");
});

test("extracts a fenced term-session card from a message", () => {
  const card = extractTermSessionCard(
    `here\n\`\`\`term-session\n${JSON.stringify(valid)}\n\`\`\``,
  );
  assert.deepEqual(card, valid);
  assert.equal(extractTermSessionCard("```term-session\nnot-json\n```"), null);
  assert.deepEqual(
    extractTermSessionCard(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``),
    valid,
  );
});

test("openclawWorkspace must be boolean true — secrets rejected by omission", () => {
  const withSecret = parseTermSessionCard(
    JSON.stringify({
      ...valid,
      openclawWorkspace: true,
      authorization: "Bearer secret",
    }),
  );
  assert.equal(withSecret?.openclawWorkspace, true);
  assert.equal("authorization" in (withSecret ?? {}), false);
});
