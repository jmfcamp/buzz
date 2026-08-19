import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultRemoteAgentName,
  MISSING_PAIRING_REQUEST_ID,
  pairingRequestIdLabel,
} from "./types.ts";

test("defaultRemoteAgentName prefers OpenClaw name then agent id", () => {
  assert.equal(defaultRemoteAgentName({ id: "mo", name: "Mo" }), "Mo");
  assert.equal(
    defaultRemoteAgentName({ id: "captain", name: "  " }),
    "captain",
  );
  assert.equal(
    defaultRemoteAgentName({ id: "wayfinder", name: "" }),
    "wayfinder",
  );
});

test("pairingRequestIdLabel falls back when the gateway omitted requestId", () => {
  assert.equal(pairingRequestIdLabel(null), MISSING_PAIRING_REQUEST_ID);
  assert.equal(pairingRequestIdLabel(""), MISSING_PAIRING_REQUEST_ID);
  assert.equal(pairingRequestIdLabel("  "), MISSING_PAIRING_REQUEST_ID);
  assert.equal(pairingRequestIdLabel("req-42"), "req-42");
});
