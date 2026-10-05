import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChannelIntroBlock } from "./ChannelIntroBlock.tsx";

test("ChannelIntroBlock preserves multi-paragraph description whitespace", () => {
  const description = "First paragraph.\n\nSecond paragraph.\nThird line.";
  const html = renderToStaticMarkup(
    React.createElement(ChannelIntroBlock, {
      intro: {
        channelKindLabel: "regular channel",
        channelName: "test",
        description,
      },
    }),
  );

  assert.match(html, /whitespace-pre-line/);
  assert.match(html, /First paragraph\.\n\nSecond paragraph\.\nThird line\./);
});

test("action chips match the channel icon height and keep two text lines", () => {
  const html = renderToStaticMarkup(
    React.createElement(ChannelIntroBlock, {
      intro: {
        actions: [
          {
            description: "Add an agent here.",
            icon: React.createElement("svg"),
            label: "Add agent",
            onClick() {},
            testId: "channel-intro-action-create-agent",
          },
          {
            description: "Invite members.",
            icon: React.createElement("svg"),
            label: "Add people",
            onClick() {},
            testId: "channel-intro-action-add-people",
          },
        ],
        channelKindLabel: "project channel",
        channelName: "products_hulabill",
        hideBeginning: true,
      },
    }),
  );

  const iconAt = html.indexOf('data-testid="message-channel-intro-icon"');
  const actionsAt = html.indexOf('data-testid="message-channel-intro-actions"');
  const nameAt = html.indexOf("#products_hulabill");
  assert.ok(iconAt > 0 && actionsAt > iconAt && nameAt > actionsAt);
  assert.equal(html.match(/h-\[60px\]/g)?.length, 3);
  assert.match(html, /Add agent/);
  assert.match(html, /Add an agent here\./);
  assert.match(html, /Add people/);
  assert.match(html, /Invite members\./);
  assert.doesNotMatch(html, /Add files/);
  assert.doesNotMatch(html, /Add a repo/);
  assert.doesNotMatch(html, /h-52/);
});
