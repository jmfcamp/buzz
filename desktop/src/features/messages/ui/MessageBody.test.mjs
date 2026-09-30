import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { HuddleContext } from "@/features/huddle/HuddleContext.tsx";
import { WAVE_MESSAGE_MARKER } from "@/features/messages/lib/waveMessage.ts";
import {
  KIND_HUDDLE_STARTED,
  KIND_STREAM_MESSAGE_DIFF,
} from "@/shared/constants/kinds";
import { MessageBody } from "./MessageBody.tsx";

function message(overrides) {
  return {
    id: "m1",
    author: "Ada",
    avatarUrl: null,
    body: "hello",
    createdAt: 1_700_000_000,
    depth: 0,
    time: "10:00",
    ...overrides,
  };
}

function renderBody(bodyMessage) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        HuddleContext.Provider,
        {
          value: {
            activeEphemeralChannelId: null,
            isStarting: false,
            joinHuddle: async () => {},
            showHuddleInMainApp: () => {},
            viewHuddleChannel: () => {},
            startHuddle: async () => {},
          },
        },
        createElement(MessageBody, {
          channelId: "channel-1",
          isKnownAgentPubkey: () => false,
          markdownClassName: "max-w-full text-left text-message text-foreground",
          message: bodyMessage,
        }),
      ),
    ),
  );
}

test("shared message body renders the huddle invitation card", () => {
  const html = renderBody(
    message({
      kind: KIND_HUDDLE_STARTED,
      createdAt: Math.floor(Date.now() / 1000),
      body: JSON.stringify({ ephemeral_channel_id: "eph-1" }),
    }),
  );
  assert.match(html, /data-testid="huddle-attachment"/);
  assert.match(html, /data-huddle-state="active"/);
});

test("shared message body renders the wave card", () => {
  const html = renderBody(
    message({
      body: `${WAVE_MESSAGE_MARKER}\nAda waved at you.`,
    }),
  );
  assert.match(html, /data-testid="message-wave-attachment"/);
  assert.match(html, /Ada waved at you/);
});

test("shared message body renders the diff card fallback", () => {
  const html = renderBody(
    message({
      kind: KIND_STREAM_MESSAGE_DIFF,
      body: "diff --git a/a.ts b/a.ts",
      tags: [["file", "a.ts"]],
    }),
  );
  assert.match(html, /Loading diff…/);
});

test("channel and inbox rows both mount the shared message body", () => {
  const body = readFileSync(new URL("./MessageBody.tsx", import.meta.url), "utf8");
  const channel = readFileSync(new URL("./MessageRow.tsx", import.meta.url), "utf8");
  const inbox = readFileSync(
    new URL("../../home/ui/InboxMessageRow.tsx", import.meta.url),
    "utf8",
  );
  assert.match(channel, /<MessageBody/);
  assert.match(inbox, /<MessageBody/);
  assert.doesNotMatch(inbox, /VideoReviewCommentMarkdown/);
  assert.match(body, /linkPreviewTags=\{message\.tags\}/);
});
