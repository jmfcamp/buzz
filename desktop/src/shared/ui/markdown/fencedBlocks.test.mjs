import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createMarkdownComponents } from "../markdown.tsx";
import { TooltipProvider } from "../tooltip.tsx";
import { getReactNodeText } from "./utils.ts";
import { renderCachedMarkdown } from "./nodeCache.ts";
import { MarkdownRuntimeContext } from "./runtimeContext.ts";

const STITCH_JSON =
  '{"hula":"playground","v":1,"name":"Mock playground","url":"https://www.google.com","pin":"123456","sid":"mock_google_1"}';

/** Exact #hula event body: lead-in, fence opener, blank line, JSON, blank line, close. */
const STITCH_BODY = `Playground card:
\`\`\`playground

${STITCH_JSON}

\`\`\``;

const COMPACT_JSON =
  '{"hula":"playground","v":1,"name":"Compact playground","url":"https://example.com","pin":"99","sid":"compact_1"}';

function renderFenceMarkdown(content, variant) {
  const markdown = renderCachedMarkdown({
    components: createMarkdownComponents(true, false),
    content,
    variant,
  });
  return renderToStaticMarkup(
    React.createElement(
      TooltipProvider,
      null,
      React.createElement(
        MarkdownRuntimeContext.Provider,
        {
          value: {
            channels: [],
            onOpenChannel: () => {},
            onOpenEntityLink: () => {},
            onOpenMessageLink: () => {},
            relayOrigin: null,
          },
        },
        markdown,
      ),
    ),
  );
}

test("getReactNodeText joins fence children without the String(array) commas", () => {
  const nodes = ["\n", `${STITCH_JSON}\n`];
  assert.equal(String(nodes), `\n,${STITCH_JSON}\n`);
  assert.equal(getReactNodeText(nodes), `\n${STITCH_JSON}\n`);
});

test("Stitch playground fence with a blank line after the opener renders a card", () => {
  const html = renderFenceMarkdown(STITCH_BODY, "playground-stitch-blank-line");
  assert.match(html, /Playground card:/);
  assert.match(html, /data-testid="playground-card"/);
  assert.match(
    html,
    /data-testid="playground-card-name"[^>]*>Mock playground</,
  );
  assert.match(
    html,
    /data-testid="playground-card-url"[^>]*>https:\/\/www\.google\.com</,
  );
  assert.match(html, /data-testid="playground-card-pin"[^>]*>123456</);
});

test("invalid playground fence shows the source instead of swallowing", () => {
  const html = renderFenceMarkdown(
    "```playground\nnot valid json {{\n```",
    "playground-garbage-fence",
  );
  assert.doesNotMatch(html, /data-testid="playground-card"/);
  assert.match(html, /not valid json \{\{/);
});

test("compact one-line playground fence still renders a card", () => {
  const html = renderFenceMarkdown(
    `\`\`\`playground\n${COMPACT_JSON}\n\`\`\``,
    "playground-compact-fence",
  );
  assert.match(html, /data-testid="playground-card"/);
  assert.match(
    html,
    /data-testid="playground-card-name"[^>]*>Compact playground</,
  );
  assert.match(
    html,
    /data-testid="playground-card-url"[^>]*>https:\/\/example\.com</,
  );
  assert.match(html, /data-testid="playground-card-pin"[^>]*>99</);
});
