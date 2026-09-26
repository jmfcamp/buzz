import assert from "node:assert/strict";
import test from "node:test";

import {
  filterTermSessionHandoffAgents,
  NO_HANDOFF_AGENTS_LABEL,
} from "./roster.ts";

function agent(over = {}) {
  return {
    pubkey: "aa",
    name: "Agent",
    status: "stopped",
    backend: { type: "local" },
    ...over,
  };
}

test("keeps active local channel members only", () => {
  const roster = [
    agent({ pubkey: "a1", status: "running" }),
    agent({ pubkey: "a2", status: "stopped" }),
    agent({
      pubkey: "a3",
      status: "running",
      backend: { type: "provider", id: "x", config: {} },
    }),
    agent({ pubkey: "a4", status: "deployed" }),
    agent({ pubkey: "a5", status: "running" }),
  ];
  const filtered = filterTermSessionHandoffAgents(roster, ["a1", "a4", "a3"]);
  assert.deepEqual(
    filtered.map((a) => a.pubkey),
    ["a1", "a4"],
  );
});

test("empty when no active local members — empty-state copy exists", () => {
  assert.deepEqual(
    filterTermSessionHandoffAgents(
      [agent({ pubkey: "a1", status: "stopped" })],
      ["a1"],
    ),
    [],
  );
  assert.equal(
    NO_HANDOFF_AGENTS_LABEL,
    "No running local agents in this channel",
  );
});
