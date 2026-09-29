import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const src = fs.readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "useHuddleScreenShare.ts",
  ),
  "utf8",
);

test("startShare sets local preview before mint/connect", () => {
  const start = src.indexOf("const startShare");
  const body = src.slice(start, src.indexOf("const stopShare", start));
  const acquireIdx = body.indexOf("await acquireDisplayMedia()");
  const previewIdx = body.indexOf("setLocalPreviewStream(acquired)");
  const mintIdx = body.indexOf("mintScreenShareToken");
  assert.ok(acquireIdx >= 0, "acquires display media");
  assert.ok(previewIdx > acquireIdx, "preview after acquire");
  assert.ok(mintIdx > previewIdx, "mint after preview");
  assert.match(body, /setSharing\(true\)/);
});

test("startShare clears preview on failure after acquire", () => {
  const start = src.indexOf("const startShare");
  const body = src.slice(start, src.indexOf("const stopShare", start));
  assert.match(body, /setLocalPreviewStream\(null\)/);
  assert.match(body, /stopMediaStreamTracks\(acquired\)/);
});

test("PC connect failure does not set available false", () => {
  // Only relay unavailable may hide Share. Catch paths must not demote
  // available after a mint that proved LiveKit is configured.
  const catchBlocks = [...src.matchAll(/\} catch \(e\) \{([\s\S]*?)\n      \}/g)].map(
    (m) => m[1],
  );
  assert.ok(catchBlocks.length >= 2, "expected subscriber + startShare catches");
  for (const block of catchBlocks) {
    assert.doesNotMatch(
      block,
      /setAvailable\(false\)/,
      "connect/share catch must not hide Share",
    );
  }
  assert.match(src, /setAvailable\(false\)/);
  assert.match(src, /unavailable/);
});

test("connect generation invalidates stale subscriber after startShare", () => {
  assert.match(src, /connectGenRef/);
  const start = src.indexOf("const startShare");
  const body = src.slice(start, src.indexOf("const stopShare", start));
  assert.match(body, /connectGenRef\.current \+= 1/);
  assert.match(src, /gen !== connectGenRef\.current/);
});

test("subscriber effect does not reconnect when parentChannelId changes", () => {
  const effect = src.slice(
    src.indexOf("React.useEffect(() => {"),
    src.indexOf("const startShare"),
  );
  assert.match(
    effect,
    /\[active, channelId, sessionCallbacks, teardown\]/,
  );
  assert.doesNotMatch(
    effect,
    /\[active, channelId, parentChannelId/,
  );
  assert.match(effect, /parentRef\.current/);
});

test("subscriber skips installing a session when startShare already owns one", () => {
  assert.match(src, /if \(sessionRef\.current\) \{\s*return;/);
});

test("benign AbortError does not setError in startShare or subscriber", () => {
  assert.match(src, /isBenignScreenShareAbort/);
  const start = src.indexOf("const startShare");
  const startBody = src.slice(start, src.indexOf("const stopShare", start));
  // startShare catch must skip setError when abort is benign
  assert.match(startBody, /isBenignScreenShareAbort\(e\)/);
  const abortIdx = startBody.indexOf("isBenignScreenShareAbort(e)");
  const setErrorIdx = startBody.indexOf("setError(e instanceof Error");
  assert.ok(abortIdx >= 0 && setErrorIdx > abortIdx, "abort guard before setError");

  const effect = src.slice(
    src.indexOf("React.useEffect(() => {"),
    src.indexOf("const startShare"),
  );
  assert.match(effect, /isBenignScreenShareAbort\(e\)/);
});
