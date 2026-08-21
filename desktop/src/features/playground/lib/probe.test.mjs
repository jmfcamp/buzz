import assert from "node:assert/strict";
import test from "node:test";

import { probePlaygroundUrl } from "./probe.ts";

test("frontend probe rejects disallowed urls without native", async () => {
  const result = await probePlaygroundUrl("http://app.example.com");
  assert.equal(result.up, false);
  assert.match(result.message ?? "", /not allowed/);
});

test("frontend probe reports down when native is unavailable", async () => {
  const result = await probePlaygroundUrl("https://app.example.com");
  assert.equal(result.up, false);
  assert.match(result.message ?? "", /desktop app/);
});

test("test stub can mark a probe up or 502 down", async () => {
  globalThis.__BUZZ_PLAYGROUND_PROBE__ = (url) => ({
    up: url.includes("up"),
    status: url.includes("up") ? 200 : 502,
    message: url.includes("up") ? null : "bad gateway",
  });
  try {
    const up = await probePlaygroundUrl("https://app.example.com/up");
    const down = await probePlaygroundUrl("https://app.example.com/down");
    assert.equal(up.up, true);
    assert.equal(down.up, false);
    assert.equal(down.status, 502);
  } finally {
    delete globalThis.__BUZZ_PLAYGROUND_PROBE__;
  }
});
