import assert from "node:assert/strict";
import test from "node:test";

import { parseBestieUserJobIntent } from "./parseBestieUserJobIntent.ts";

test("parses schedule a job in N minutes", () => {
  const nowMs = Date.parse("2026-09-27T12:00:00.000-07:00");
  const intent = parseBestieUserJobIntent(
    "Schedule a job in 10 minutes to draft standup notes",
    nowMs,
  );
  assert.equal(intent?.op, "add");
  assert.equal(intent.job.schedule.kind, "once");
  assert.equal(intent.job.prompt, "draft standup notes");
});

test("parses every N minutes job", () => {
  const intent = parseBestieUserJobIntent(
    "Every 30 minutes run a job to check the build",
  );
  assert.equal(intent?.op, "add");
  assert.equal(intent.job.schedule.kind, "interval");
  assert.equal(intent.job.schedule.everySeconds, 1800);
});

test("parses cancel job", () => {
  const intent = parseBestieUserJobIntent('Cancel job "Inbox"');
  assert.equal(intent?.op, "remove-match");
  assert.equal(intent.title, "Inbox");
});
