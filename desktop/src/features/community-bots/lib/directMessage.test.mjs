import assert from "node:assert/strict";
import test from "node:test";

import { canDirectMessageIdentity } from "./directMessage.ts";

test("community bots are DM peers for any member", () => {
  assert.equal(
    canDirectMessageIdentity({
      isBot: true,
      isCommunityBot: true,
      viewerIsOwner: false,
    }),
    true,
  );
});

test("people stay DM-able", () => {
  assert.equal(
    canDirectMessageIdentity({
      isBot: false,
      isCommunityBot: false,
      viewerIsOwner: false,
    }),
    true,
  );
});

test("managed and relay agents stay owner-gated", () => {
  assert.equal(
    canDirectMessageIdentity({
      isBot: true,
      isCommunityBot: false,
      viewerIsOwner: false,
    }),
    false,
  );
  assert.equal(
    canDirectMessageIdentity({
      isBot: true,
      isCommunityBot: false,
      viewerIsOwner: true,
    }),
    true,
  );
});
