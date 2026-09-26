import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_DRIVING_CHROME_TOOLTIP,
  isAgentDrivingChromeLocked,
} from "./chromeLock.ts";

/** @param {Partial<import("./types.ts").BrowserAgentGrant>} [over] */
function grant(over = {}) {
  return {
    webviewLabel: "playground-demo",
    surface: "playground",
    surfaceId: "demo",
    agentId: "agent",
    agentPubkey: "pub",
    channelId: "ch",
    threadRoot: null,
    mode: "drive",
    userHasControl: false,
    createdAtMs: 1,
    ...over,
  };
}

test("tooltip copy", () => {
  assert.equal(AGENT_DRIVING_CHROME_TOOLTIP, "Agent is driving");
});

test("Drive without Take control locks chrome", () => {
  assert.equal(isAgentDrivingChromeLocked(grant()), true);
  assert.equal(
    isAgentDrivingChromeLocked(grant({ userHasControl: false })),
    true,
  );
  assert.equal(
    isAgentDrivingChromeLocked(grant({ userHasControl: undefined })),
    true,
  );
});

test("Drive + Take control unlocks chrome", () => {
  assert.equal(
    isAgentDrivingChromeLocked(grant({ userHasControl: true })),
    false,
  );
});

test("Observe and Off leave chrome unlocked", () => {
  assert.equal(isAgentDrivingChromeLocked(null), false);
  assert.equal(isAgentDrivingChromeLocked(undefined), false);
  assert.equal(
    isAgentDrivingChromeLocked(grant({ mode: "observe", userHasControl: false })),
    false,
  );
});
