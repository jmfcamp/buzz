import assert from "node:assert/strict";
import test from "node:test";

import {
  beginBestieCoffeeRun,
  completeBestieCoffeeRun,
  emptyBestieCoffeeState,
  isBestieCoffeeBrewing,
} from "./bestieCoffeeStorage.ts";
import { localDayKey } from "./bestieCoffeeSchedule.ts";

test("brief+expand storage: complete appends entry and clears pending", () => {
  let state = emptyBestieCoffeeState();
  const begun = beginBestieCoffeeRun(state, "scheduled", 1_000);
  assert.ok(begun);
  assert.equal(isBestieCoffeeBrewing(begun), true);
  assert.equal(beginBestieCoffeeRun(begun, "brew", 1_001), null);

  state = completeBestieCoffeeRun(
    begun,
    {
      brief: "",
      fullOutput: "Morning looks calm. Details below.",
      source: "scheduled",
    },
    1_100,
  );
  assert.equal(state.pendingRun, null);
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].brief, "Morning looks calm.");
  assert.match(state.entries[0].fullOutput, /Details below/);
  assert.equal(state.lastScheduledDayKey, localDayKey(1_100));
});
