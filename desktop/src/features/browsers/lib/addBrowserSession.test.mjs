import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBrowserSessionCard,
  normalizeBrowserSessionName,
  normalizeBrowserSessionUrl,
} from "./addBrowserSession.ts";

test("normalizeBrowserSessionUrl adds https and accepts http", () => {
  assert.equal(
    normalizeBrowserSessionUrl("example.com/path"),
    "https://example.com/path",
  );
  assert.equal(
    normalizeBrowserSessionUrl("http://localhost:3000"),
    "http://localhost:3000/",
  );
  assert.equal(normalizeBrowserSessionUrl(""), null);
  assert.equal(normalizeBrowserSessionUrl("ftp://example.com"), null);
  assert.equal(normalizeBrowserSessionUrl("https://example.com:9222"), null);
});

test("normalizeBrowserSessionName falls back to hostname", () => {
  assert.equal(
    normalizeBrowserSessionName("  Demo  ", "https://example.com"),
    "Demo",
  );
  assert.equal(
    normalizeBrowserSessionName("", "https://example.com/x"),
    "example.com",
  );
});

test("buildBrowserSessionCard creates a playground card", () => {
  const card = buildBrowserSessionCard({
    url: "example.com",
    name: "My site",
  });
  assert.ok(card);
  assert.equal(card.hula, "playground");
  assert.equal(card.v, 1);
  assert.equal(card.url, "https://example.com/");
  assert.equal(card.name, "My site");
  assert.ok(card.sid.length > 0);
});
