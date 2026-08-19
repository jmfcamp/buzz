import assert from "node:assert/strict";
import test from "node:test";

import { MISSING_PAIRING_REQUEST_ID, pairingRequestIdLabel } from "./types.ts";

test("pairingRequestIdLabel falls back when the gateway omitted requestId", () => {
  assert.equal(pairingRequestIdLabel(null), MISSING_PAIRING_REQUEST_ID);
  assert.equal(pairingRequestIdLabel(""), MISSING_PAIRING_REQUEST_ID);
  assert.equal(pairingRequestIdLabel("  "), MISSING_PAIRING_REQUEST_ID);
  assert.equal(pairingRequestIdLabel("req-42"), "req-42");
});
