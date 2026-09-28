import assert from "node:assert/strict";
import test from "node:test";

import {
  __resetBestieAttentionStoreForTests,
  clearBestieUnreadMessage,
  getBestieHasUnreadMessage,
  ingestBestieAgentMessageCreatedAt,
  isBestieSurfaceOpen,
  markBestieAgentMessagesSeen,
  setBestiePopoverOpen,
  setBestieViewingDm,
} from "./bestieAttentionStore.ts";

test("agent message while closed sets unread; open clears", () => {
  __resetBestieAttentionStoreForTests();
  assert.equal(getBestieHasUnreadMessage(), false);
  ingestBestieAgentMessageCreatedAt(100);
  assert.equal(getBestieHasUnreadMessage(), true);
  setBestiePopoverOpen(true);
  assert.equal(isBestieSurfaceOpen(), true);
  assert.equal(getBestieHasUnreadMessage(), false);
  setBestiePopoverOpen(false);
  ingestBestieAgentMessageCreatedAt(100);
  assert.equal(getBestieHasUnreadMessage(), false);
  ingestBestieAgentMessageCreatedAt(200);
  assert.equal(getBestieHasUnreadMessage(), true);
  setBestieViewingDm(true);
  assert.equal(getBestieHasUnreadMessage(), false);
  clearBestieUnreadMessage();
  markBestieAgentMessagesSeen(300);
  ingestBestieAgentMessageCreatedAt(250);
  assert.equal(getBestieHasUnreadMessage(), false);
});
