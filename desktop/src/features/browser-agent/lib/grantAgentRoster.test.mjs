import assert from "node:assert/strict";
import test from "node:test";

import {
  filterActiveLocalManagedAgents,
  isActiveLocalManagedAgent,
  NO_RUNNING_LOCAL_AGENTS_LABEL,
} from "./grantAgentRoster.ts";

function agent(over = {}) {
  return {
    status: "stopped",
    backend: { type: "local" },
    ...over,
  };
}

test("active local running is eligible", () => {
  assert.equal(
    isActiveLocalManagedAgent(agent({ status: "running" })),
    true,
  );
});

test("active local deployed matches sidebar isManagedAgentActive", () => {
  assert.equal(
    isActiveLocalManagedAgent(agent({ status: "deployed" })),
    true,
  );
});

test("stopped local is not eligible", () => {
  assert.equal(
    isActiveLocalManagedAgent(agent({ status: "stopped" })),
    false,
  );
});

test("running provider / remote backend is not eligible", () => {
  assert.equal(
    isActiveLocalManagedAgent(
      agent({
        status: "running",
        backend: { type: "provider", id: "gateway", config: {} },
      }),
    ),
    false,
  );
});

test("filter keeps only active local agents", () => {
  const roster = [
    agent({ status: "running", pubkey: "a" }),
    agent({ status: "stopped", pubkey: "b" }),
    agent({
      status: "running",
      pubkey: "c",
      backend: { type: "provider", id: "x", config: {} },
    }),
    agent({ status: "deployed", pubkey: "d" }),
    agent({ status: "not_deployed", pubkey: "e" }),
  ];
  const filtered = filterActiveLocalManagedAgents(roster);
  assert.deepEqual(
    filtered.map((a) => a.pubkey),
    ["a", "d"],
  );
});

test("empty filter yields empty roster and empty-state copy exists", () => {
  assert.deepEqual(filterActiveLocalManagedAgents([]), []);
  assert.equal(NO_RUNNING_LOCAL_AGENTS_LABEL, "No running local agents");
});
