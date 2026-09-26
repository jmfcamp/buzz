import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EMPTY_PREVIEW_PNG_BYTE_LENGTH,
  browserPreviewFaviconHost,
  isUsablePreviewPng,
  previewBytesToDataUrl,
} from "./browserPreview.ts";

test("isUsablePreviewPng rejects empty stub and accepts larger payloads", () => {
  assert.equal(
    isUsablePreviewPng(new Array(EMPTY_PREVIEW_PNG_BYTE_LENGTH)),
    false,
  );
  assert.equal(
    isUsablePreviewPng(new Array(EMPTY_PREVIEW_PNG_BYTE_LENGTH + 1)),
    true,
  );
  assert.equal(isUsablePreviewPng([]), false);
});

test("previewBytesToDataUrl builds a png data URL", () => {
  const url = previewBytesToDataUrl([0x89, 0x50, 0x4e, 0x47], "image/png");
  assert.ok(url.startsWith("data:image/png;base64,"));
});

test("browserPreviewFaviconHost parses hostname", () => {
  assert.equal(
    browserPreviewFaviconHost("https://app.example.com/path"),
    "app.example.com",
  );
  assert.equal(browserPreviewFaviconHost("not a url"), null);
});

test("BrowserRowPreview scales the full capture with object-contain (no cover crop)", () => {
  const src = readFileSync(
    new URL("../ui/BrowserRowPreview.tsx", import.meta.url),
    "utf8",
  );
  const nearImg = src.match(
    /<img\s+[\s\S]*?className="([^"]+)"[\s\S]*?data-testid=\{\`browser-row-preview-img-\$\{sid\}\`\}/,
  );
  assert.ok(nearImg, "expected preview <img> with className");
  const className = nearImg[1];
  assert.match(className, /\bobject-contain\b/);
  assert.equal(/\bobject-cover\b/.test(className), false);
  assert.equal(/\bobject-top\b/.test(className), false);
});

test("captureBrowserPreview requests viewport-native screenshot (not fullPage)", () => {
  const src = readFileSync(new URL("./browserPreview.ts", import.meta.url), "utf8");
  assert.match(src, /fullPage:\s*false/);
  assert.equal(/fullPage:\s*true/.test(src), false);
  assert.match(src, /playground_webview_screenshot/);
});

test("BrowserRowPreview thumb stays h-16 letterbox with object-contain", () => {
  const src = readFileSync(
    new URL("../ui/BrowserRowPreview.tsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /\bh-16\b/);
  assert.match(src, /w-\[5\.5rem\]/);
  assert.equal(/\bh-14\b/.test(src), false);
});
