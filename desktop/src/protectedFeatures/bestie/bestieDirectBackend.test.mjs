import assert from "node:assert/strict";
import test from "node:test";

import { parseJobSchedule } from "./bestieDirectBackend.ts";

test("job schedules from the web are validated", () => {
  assert.deepEqual(parseJobSchedule({ kind: "daily", hour: 8, minute: 30 }), { kind: "daily", hour: 8, minute: 30 });
  assert.deepEqual(parseJobSchedule({ kind: "weekly", hour: 9, minute: 0, weekday: 1 }), { kind: "weekly", hour: 9, minute: 0, weekday: 1 });
  assert.throws(() => parseJobSchedule({ kind: "interval", everySeconds: 5 }));
  assert.throws(() => parseJobSchedule({ kind: "daily", hour: 25, minute: 0 }));
  assert.throws(() => parseJobSchedule({ kind: "cron" }));
});
