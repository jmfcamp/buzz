import assert from "node:assert/strict";
import test from "node:test";

import { extractPlaygroundCard, parsePlaygroundCard } from "./card.ts";

const valid = {
  hula: "playground",
  v: 1,
  name: "Demo",
  url: "https://app.example.com",
  pin: "1234",
  sid: "demo-1",
};

test("parses required playground card fields without rewriting them", () => {
  const card = parsePlaygroundCard(JSON.stringify(valid));
  assert.deepEqual(card, valid);
});

test("keeps optional stack and expires only when present", () => {
  const card = parsePlaygroundCard(
    JSON.stringify({ ...valid, stack: "hula-app", expires: "2026-08-22" }),
  );
  assert.equal(card?.stack, "hula-app");
  assert.equal(card?.expires, "2026-08-22");
  assert.equal("stack" in parsePlaygroundCard(JSON.stringify(valid)), false);
});

test("rejects malformed cards and non-https urls", () => {
  assert.equal(parsePlaygroundCard("{"), null);
  assert.equal(
    parsePlaygroundCard(JSON.stringify({ ...valid, hula: "pin" })),
    null,
  );
  assert.equal(parsePlaygroundCard(JSON.stringify({ ...valid, v: 2 })), null);
  assert.equal(
    parsePlaygroundCard(JSON.stringify({ ...valid, name: "" })),
    null,
  );
  assert.equal(
    parsePlaygroundCard(
      JSON.stringify({ ...valid, url: "http://app.example.com" }),
    ),
    null,
  );
  assert.equal(
    parsePlaygroundCard(
      JSON.stringify({ ...valid, url: "https://app.example.com:18789" }),
    ),
    null,
  );
});

test("extracts a fenced playground card from a message", () => {
  const card = extractPlaygroundCard(
    `here\n\`\`\`playground\n${JSON.stringify(valid)}\n\`\`\``,
  );
  assert.deepEqual(card, valid);
  assert.equal(extractPlaygroundCard("```playground\nnot-json\n```"), null);
});
