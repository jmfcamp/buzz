import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HOME_MENTION_EVENT_KINDS,
  KIND_HUDDLE_STARTED,
  KIND_JOB_REQUEST,
  KIND_STREAM_MESSAGE_DIFF,
  KIND_SYSTEM_MESSAGE,
} from "@/shared/constants/kinds";
import {
  INBOX_THREAD_CONTEXT_KINDS,
  inboxThreadDescendantFilter,
} from "./inboxThreadContextFilter.ts";

test("inbox thread context keeps chat cards and skips system and job rows", () => {
  assert.equal(INBOX_THREAD_CONTEXT_KINDS.includes(KIND_HUDDLE_STARTED), true);
  assert.equal(
    INBOX_THREAD_CONTEXT_KINDS.includes(KIND_STREAM_MESSAGE_DIFF),
    true,
  );
  for (const kind of HOME_MENTION_EVENT_KINDS) {
    assert.equal(INBOX_THREAD_CONTEXT_KINDS.includes(kind), true);
  }
  assert.equal(INBOX_THREAD_CONTEXT_KINDS.includes(KIND_SYSTEM_MESSAGE), false);
  assert.equal(INBOX_THREAD_CONTEXT_KINDS.includes(KIND_JOB_REQUEST), false);

  const filter = inboxThreadDescendantFilter("channel-1", "root-1");
  assert.deepEqual(filter["#e"], ["root-1"]);
  assert.deepEqual(filter["#h"], ["channel-1"]);
  assert.deepEqual(filter.kinds, [...INBOX_THREAD_CONTEXT_KINDS]);
  assert.equal(filter.limit, 100);
});

test("inbox thread hydration requests the shared card filter", () => {
  const source = readFileSync(
    new URL("../useInboxThreadContext.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /inboxThreadDescendantFilter\(/);
  assert.doesNotMatch(source, /HOME_MENTION_EVENT_KINDS/);
});
