import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyBestieAttentionMessage,
  classifyBestieAttentionMessages,
  formatBestieListIntroBanner,
  isBestieListOnlyAttentionMessage,
} from "./bestieListIntroNotice.ts";

const reminderFence = [
  "```bestie-list",
  '{"op":"add","items":[{"kind":"reminder","text":"Call mom"}]}',
  "```",
].join("\n");

const todoFence = [
  "```bestie-list",
  '{"op":"add","items":[{"kind":"todo","text":"Ship phase 2"}]}',
  "```",
].join("\n");

const twoRemindersFence = [
  "```bestie-list",
  '{"op":"add","items":[{"kind":"reminder","text":"Call mom"},{"kind":"reminder","text":"Pay rent"}]}',
  "```",
].join("\n");

const scratchFence = [
  "```bestie-scratch",
  '{"op":"add","title":"Idea","body":"park this for later"}',
  "```",
].join("\n");

const threadFence = [
  "```bestie-thread",
  '{"op":"add","channelId":"chan","rootEventId":"evt"}',
  "```",
].join("\n");

const jobFence = [
  "```bestie-job",
  '{"op":"add","confirmed":true,"job":{"title":"Morning brief","prompt":"Summarize calendar","schedule":{"kind":"daily","hour":9,"minute":0}}}',
  "```",
].join("\n");

test("fence-only reminder is list-only, not a real message", () => {
  const verdict = classifyBestieAttentionMessage(reminderFence);
  assert.equal(verdict.kind, "list-only");
  assert.equal(isBestieListOnlyAttentionMessage(reminderFence), true);
  if (verdict.kind !== "list-only") return;
  assert.equal(formatBestieListIntroBanner(verdict.counts), "Added a reminder");
});

test("prose plus a list fence is a real message", () => {
  const body = `I'll remind you to call mom.\n\n${reminderFence}`;
  assert.equal(classifyBestieAttentionMessage(body).kind, "real-message");
  assert.equal(isBestieListOnlyAttentionMessage(body), false);
});

test("todo and scratch note combine in plain language", () => {
  const verdict = classifyBestieAttentionMessages([todoFence, scratchFence]);
  assert.deepEqual(verdict, {
    kind: "list-only",
    banner: "Added a to-do and a scratch note",
    counts: {
      job: 0,
      reminder: 0,
      scratch: 1,
      thread: 0,
      todo: 1,
    },
  });
});

test("a real message in the batch suppresses the list banner", () => {
  const verdict = classifyBestieAttentionMessages([
    reminderFence,
    "Hey, are you free later?",
  ]);
  assert.deepEqual(verdict, { kind: "real-message" });
});

test("counts plural kinds and threads and jobs without ids", () => {
  const verdict = classifyBestieAttentionMessages([
    twoRemindersFence,
    threadFence,
    jobFence,
  ]);
  assert.equal(verdict.kind, "list-only");
  if (verdict.kind !== "list-only") return;
  assert.equal(verdict.banner, "Added 2 reminders, a thread, and a job");
  assert.equal(verdict.banner.includes("chan"), false);
  assert.equal(verdict.banner.includes("evt"), false);
});

test("complete-only fence and empty bodies are not list introductions", () => {
  const complete = [
    "```bestie-list",
    '{"op":"complete","id":"abc"}',
    "```",
  ].join("\n");
  assert.equal(classifyBestieAttentionMessage(complete).kind, "none");
  assert.equal(classifyBestieAttentionMessages(["", null]).kind, "none");
});

test("unconfirmed job draft does not count as added", () => {
  const draft = [
    "```bestie-job",
    '{"op":"add","job":{"title":"Morning brief","prompt":"Summarize","schedule":{"kind":"daily","hour":9,"minute":0}}}',
    "```",
  ].join("\n");
  assert.equal(classifyBestieAttentionMessage(draft).kind, "none");
});
