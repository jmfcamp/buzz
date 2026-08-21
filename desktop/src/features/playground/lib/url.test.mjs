import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedPlaygroundUrl } from "./url.ts";

test("accepts https app origins and rejects http, ws, and debug ports", () => {
  assert.equal(isAllowedPlaygroundUrl("https://app.example.com"), true);
  assert.equal(isAllowedPlaygroundUrl("https://app.example.com/path"), true);
  assert.equal(isAllowedPlaygroundUrl("http://app.example.com"), false);
  assert.equal(isAllowedPlaygroundUrl("ws://app.example.com"), false);
  assert.equal(isAllowedPlaygroundUrl("wss://app.example.com"), false);
  assert.equal(isAllowedPlaygroundUrl("https://app.example.com:18789"), false);
  assert.equal(isAllowedPlaygroundUrl("https://app.example.com:9222"), false);
  assert.equal(isAllowedPlaygroundUrl("https://app.example.com:9223"), false);
  assert.equal(isAllowedPlaygroundUrl("https://app.example.com:9229"), false);
  assert.equal(isAllowedPlaygroundUrl("https://app.example.com:9230"), false);
  assert.equal(isAllowedPlaygroundUrl("https://app.example.com:5858"), false);
});
