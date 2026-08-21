import assert from "node:assert/strict";
import test from "node:test";

import {
  PRIMARY_MENU_ITEMS,
  primaryMenuItemAfter,
  primaryMenuLabels,
} from "./primaryMenu.ts";

test("primary menu places Bots immediately after Agents", () => {
  assert.deepEqual(primaryMenuLabels(), [
    "Inbox",
    "Pulse",
    "Projects",
    "Agents",
    "Bots",
    "Workflows",
  ]);
  assert.equal(primaryMenuItemAfter("agents").id, "bots");
  assert.equal(primaryMenuItemAfter("agents").label, "Bots");
  assert.equal(primaryMenuItemAfter("agents").testId, "open-bots-view");

  const agentsIndex = PRIMARY_MENU_ITEMS.findIndex(
    (item) => item.id === "agents",
  );
  const botsIndex = PRIMARY_MENU_ITEMS.findIndex((item) => item.id === "bots");
  assert.equal(botsIndex, agentsIndex + 1);
  assert.ok(
    botsIndex < PRIMARY_MENU_ITEMS.findIndex((item) => item.id === "workflows"),
  );
});

test("Bots is its own primary item, not mixed into Agents or Settings", () => {
  const bots = PRIMARY_MENU_ITEMS.find((item) => item.id === "bots");
  const agents = PRIMARY_MENU_ITEMS.find((item) => item.id === "agents");
  assert.ok(bots);
  assert.ok(agents);
  assert.notEqual(bots.testId, agents.testId);
  assert.notEqual(bots.label, "Settings");
});
