import assert from "node:assert/strict";
import test from "node:test";

import {
  PRIMARY_MENU_ITEMS,
  primaryMenuItemAfter,
  primaryMenuLabels,
} from "./primaryMenu.ts";

test("primary menu places Browsers immediately before Agents", () => {
  assert.deepEqual(primaryMenuLabels(), [
    "Inbox",
    "Pulse",
    "Projects",
    "Browsers",
    "Agents",
    "Bots",
    "Workflows",
  ]);
  assert.equal(primaryMenuItemAfter("browsers").id, "agents");
  assert.equal(primaryMenuItemAfter("browsers").label, "Agents");
  assert.equal(primaryMenuItemAfter("browsers").testId, "open-agents-view");
  assert.equal(primaryMenuItemAfter("agents").id, "bots");

  const browsersIndex = PRIMARY_MENU_ITEMS.findIndex(
    (item) => item.id === "browsers",
  );
  const agentsIndex = PRIMARY_MENU_ITEMS.findIndex(
    (item) => item.id === "agents",
  );
  const botsIndex = PRIMARY_MENU_ITEMS.findIndex((item) => item.id === "bots");
  assert.equal(agentsIndex, browsersIndex + 1);
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
