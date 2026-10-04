import assert from "node:assert/strict";
import test from "node:test";

import {
  bestieAskReminderDueAt,
  buildBestieMessageContext,
  buildBestieMessageLink,
  composeBestieAskContent,
  composeBestieAskReminderPrompt,
  composeBestieAskScratchNote,
  composeBestieAskScratchPrompt,
  composeBestieAskTodoPrompt,
} from "./bestieMessageContext.ts";

const CHANNEL_ID = "channel-1";

function message(overrides = {}) {
  return {
    id: "message-1",
    author: "Baxen",
    body: "This visible body must not be copied into the agent prompt.",
    createdAt: 1,
    depth: 0,
    time: "8:52 AM",
    ...overrides,
  };
}

test("sends a canonical link to a top-level message instead of its body", () => {
  const context = buildBestieMessageContext(CHANNEL_ID, message());

  assert.equal(
    context,
    "Help me with this thread from Baxen:\n\nbuzz://message?channel=channel-1&id=message-1",
  );
  assert.doesNotMatch(context, /visible body/);
});

test("links a reply to its thread root", () => {
  const context = buildBestieMessageContext(
    CHANNEL_ID,
    message({ id: "reply-1", rootId: "root-1", parentId: "root-1" }),
  );

  assert.equal(
    context,
    "Help me with this thread from Baxen:\n\nbuzz://message?channel=channel-1&id=root-1&thread=root-1",
  );
});

test("does not construct a lossy fallback when channel context is missing", () => {
  assert.equal(buildBestieMessageContext(null, message()), null);
  assert.equal(buildBestieMessageContext(CHANNEL_ID, undefined), null);
});

test("includes the originating message only when the sender opts in", () => {
  const envelope = buildBestieMessageContext(CHANNEL_ID, message());
  const question = "What did they mean?";

  const included = composeBestieAskContent(question, envelope, {
    includeContext: true,
    contextAlreadySent: false,
  });
  assert.equal(included.attachedContext, true);
  assert.equal(included.content, `${envelope}\n\n${question}`);

  const omitted = composeBestieAskContent(question, envelope, {
    includeContext: false,
    contextAlreadySent: false,
  });
  assert.equal(omitted.attachedContext, false);
  assert.equal(omitted.content, question);
  assert.doesNotMatch(omitted.content, /buzz:\/\/message/);

  const alreadySent = composeBestieAskContent(question, envelope, {
    includeContext: true,
    contextAlreadySent: true,
  });
  assert.equal(alreadySent.attachedContext, false);
  assert.equal(alreadySent.content, question);

  const noMessage = composeBestieAskContent(question, null, {
    includeContext: true,
    contextAlreadySent: false,
  });
  assert.equal(noMessage.attachedContext, false);
  assert.equal(noMessage.content, question);
});

test("builds a message link without copying the body", () => {
  assert.equal(
    buildBestieMessageLink(CHANNEL_ID, message()),
    "buzz://message?channel=channel-1&id=message-1",
  );
  assert.equal(buildBestieMessageLink(null, message()), null);
});

test("checked reminder and todo prompts distill before creating", () => {
  for (const [delay, label] of [
    ["15m", "15 minutes"],
    ["1h", "1 hour"],
    ["24h", "24 hours"],
  ]) {
    const prompt = composeBestieAskReminderPrompt(delay);
    assert.match(prompt, new RegExp(`due in ${label}`));
    assert.match(prompt, /distill/i);
    assert.doesNotMatch(prompt, /^Remind me to/i);
  }
  const todo = composeBestieAskTodoPrompt();
  assert.match(todo, /distill/i);
  assert.match(todo, /to-do/i);
  assert.doesNotMatch(todo, /^Add a todo/i);
  assert.equal(
    composeBestieAskScratchPrompt(),
    "Park this: Message\nCapture the included message context from this Ask Assistant session.",
  );
  assert.deepEqual(
    composeBestieAskScratchNote({
      author: "Baxen",
      body: "Ship the scratch note with the whole message.",
      messageLink: "buzz://message?channel=channel-1&id=message-1",
    }),
    {
      title: "Baxen",
      body: "Ship the scratch note with the whole message.\n\nbuzz://message?channel=channel-1&id=message-1",
    },
  );
});

test("unchecked reminder due times are unix seconds from now", () => {
  const now = 1_700_000_000_000;
  assert.equal(bestieAskReminderDueAt("15m", now), 1_700_000_000 + 15 * 60);
  assert.equal(bestieAskReminderDueAt("1h", now), 1_700_000_000 + 60 * 60);
  assert.equal(bestieAskReminderDueAt("24h", now), 1_700_000_000 + 24 * 60 * 60);
});
