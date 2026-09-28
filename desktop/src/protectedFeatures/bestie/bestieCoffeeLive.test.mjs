import assert from "node:assert/strict";
import test from "node:test";

import {
  BESTIE_COFFEE_START_GRACE_SECONDS,
  BESTIE_COFFEE_STALE_PENDING_SECONDS,
  isBestieCoffeeLive,
  isBestieCoffeePendingStale,
  messageLooksLikeBestieCoffeeTrigger,
  shouldDisableBestieCoffeeBrew,
} from "./bestieCoffeeLive.ts";

test("messageLooksLikeBestieCoffeeTrigger matches marker and slash skill", () => {
  assert.equal(
    messageLooksLikeBestieCoffeeTrigger("[Bestie coffee]\n\n/hula-coffee"),
    true,
  );
  assert.equal(messageLooksLikeBestieCoffeeTrigger("/hula-coffee force"), true);
  assert.equal(messageLooksLikeBestieCoffeeTrigger("please brew coffee"), false);
});

test("live during start grace even without ACP working (👀 phase)", () => {
  const startedAt = 1_000;
  assert.equal(
    isBestieCoffeeLive({
      agentWorkingOnBestieDm: false,
      nowSeconds: startedAt + BESTIE_COFFEE_START_GRACE_SECONDS,
      pendingRun: { source: "brew", startedAt, triggerMessageId: null },
    }),
    true,
  );
  assert.equal(
    isBestieCoffeeLive({
      agentWorkingOnBestieDm: false,
      nowSeconds: startedAt + BESTIE_COFFEE_START_GRACE_SECONDS + 1,
      pendingRun: { source: "brew", startedAt, triggerMessageId: null },
    }),
    false,
  );
});

test("live while ACP agent is working the Bestie DM", () => {
  assert.equal(
    isBestieCoffeeLive({
      agentWorkingOnBestieDm: true,
      nowSeconds: 5_000,
      pendingRun: {
        source: "scheduled",
        startedAt: 1_000,
        triggerMessageId: "t1",
      },
    }),
    true,
  );
});

test("manual coffee trigger + ACP working disables brew without pendingRun", () => {
  assert.equal(
    isBestieCoffeeLive({
      agentWorkingOnBestieDm: true,
      nowSeconds: 2_000,
      openCoffeeTriggerAt: 1_500,
      pendingRun: null,
    }),
    true,
  );
  assert.equal(
    shouldDisableBestieCoffeeBrew({
      agentWorkingOnBestieDm: true,
      nowSeconds: 2_000,
      openCoffeeTriggerAt: 1_500,
      pendingRun: null,
    }),
    true,
  );
});

test("stale pending clears only after idle past stale window", () => {
  const startedAt = 1_000;
  assert.equal(
    isBestieCoffeePendingStale({
      agentWorkingOnBestieDm: false,
      nowSeconds: startedAt + BESTIE_COFFEE_START_GRACE_SECONDS + 1,
      pendingRun: { source: "brew", startedAt, triggerMessageId: null },
    }),
    false,
  );
  assert.equal(
    isBestieCoffeePendingStale({
      agentWorkingOnBestieDm: false,
      nowSeconds: startedAt + BESTIE_COFFEE_STALE_PENDING_SECONDS,
      pendingRun: { source: "brew", startedAt, triggerMessageId: null },
    }),
    true,
  );
  assert.equal(
    isBestieCoffeePendingStale({
      agentWorkingOnBestieDm: true,
      nowSeconds: startedAt + BESTIE_COFFEE_STALE_PENDING_SECONDS,
      pendingRun: { source: "brew", startedAt, triggerMessageId: null },
    }),
    false,
  );
});
