import assert from "node:assert/strict";
import test from "node:test";

import {
  canViewCommunityBotSecret,
  defaultRemoteAgentName,
  isMissingBuzzAccountError,
  missingBuzzAccountMessage,
  MISSING_PAIRING_REQUEST_ID,
  pairingRequestIdLabel,
  parseConfirmedPublicHex,
  VPS_SECRET_UNAVAILABLE,
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

test("confirmed public hex rejects nsec and accepts 64-char hex", () => {
  const hex = "22".repeat(32);
  assert.equal(parseConfirmedPublicHex(hex), hex);
  assert.equal(parseConfirmedPublicHex(` ${hex.toUpperCase()} `), hex);
  assert.equal(parseConfirmedPublicHex("nsec1notallowed"), null);
  assert.equal(parseConfirmedPublicHex("npub1notallowed"), null);
  assert.equal(parseConfirmedPublicHex("zz".repeat(32)), null);
  assert.match(
    missingBuzzAccountMessage("mo"),
    /openclaw channels add --channel buzz --account mo/,
  );
  assert.equal(
    isMissingBuzzAccountError(new Error(missingBuzzAccountMessage("mo"))),
    true,
  );
});

test("canViewCommunityBotSecret requires an owner/admin and an installed bot", () => {
  assert.equal(
    canViewCommunityBotSecret({
      canManageCommunity: true,
      isInstalledBot: true,
    }),
    true,
  );
  assert.equal(
    canViewCommunityBotSecret({
      canManageCommunity: false,
      isInstalledBot: true,
    }),
    false,
  );
  assert.equal(
    canViewCommunityBotSecret({
      canManageCommunity: true,
      isInstalledBot: false,
    }),
    false,
  );
  assert.match(VPS_SECRET_UNAVAILABLE, /stays on the VPS/);
});

test("pairingRequestIdLabel falls back when the gateway omitted requestId", () => {
  assert.equal(pairingRequestIdLabel(null), MISSING_PAIRING_REQUEST_ID);
  assert.equal(pairingRequestIdLabel(""), MISSING_PAIRING_REQUEST_ID);
  assert.equal(pairingRequestIdLabel("  "), MISSING_PAIRING_REQUEST_ID);
  assert.equal(pairingRequestIdLabel("req-42"), "req-42");
});
