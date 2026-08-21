import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  decodeUtf8Text,
  FILE_PREVIEW_MAX_BYTES,
  fileExtension,
  fileTypeLabel,
  formatFileSize,
  HTML_PREVIEW_IFRAME_SANDBOX,
  htmlIframePlan,
  htmlPreviewFrameProps,
  htmlSafetyPlan,
  planFilePreviewRender,
  previewSourceLanguage,
  resolveFetchedPreview,
  resolveFilePreviewKind,
} from "./filePreview.ts";

const MEDIA_HTML = `https://relay.example/media/${"c".repeat(64)}.html`;
const MEDIA_MD = `https://relay.example/media/${"d".repeat(64)}.md`;
const MEDIA_TXT = `https://relay.example/media/${"e".repeat(64)}.txt`;
const MEDIA_ZIP = `https://relay.example/media/${"f".repeat(64)}.zip`;
const MEDIA_BIN = `https://relay.example/media/${"0".repeat(64)}`;

function assertRenderedHtmlPlan(plan) {
  assert.equal(plan.kind, "html");
  assert.equal(plan.navigateUrl, null);
  assert.ok(plan.iframe, "HTML attachments render in a sandboxed iframe");
  assert.equal(plan.iframe.src, null);
  assert.equal(plan.iframe.srcdoc, true);
  assert.equal(plan.iframe.sandbox, HTML_PREVIEW_IFRAME_SANDBOX);
  assert.equal(plan.iframe.sandbox, "");
  assert.equal(plan.iframe.sandbox.includes("allow-scripts"), false);
  assert.equal(plan.iframe.sandbox.includes("allow-same-origin"), false);
  assert.ok(plan.html, "HTML attachments must carry a rendered safety plan");
  assert.equal(plan.html.mode, "rendered");
  assert.equal(plan.html.iframeSrc, null);
  assert.equal(plan.html.iframeSandbox, "");
  assert.equal(plan.html.navigateTo, null);
  assert.equal(plan.html.allowScripts, false);
  // fetchUrl is the authenticated IPC argument — never a document URL.
  assert.equal(plan.fetchUrl, MEDIA_HTML);
  assert.notEqual(plan.fetchUrl, plan.navigateUrl);
  assert.notEqual(plan.fetchUrl, plan.html.iframeSrc);
  assert.notEqual(plan.fetchUrl, plan.html.navigateTo);
  assert.notEqual(plan.fetchUrl, plan.iframe.src);
}

test("resolveFilePreviewKind: markdown MIME renders as markdown", () => {
  const kind = resolveFilePreviewKind({
    mime: "text/markdown",
    filename: "notes.md",
    size: 120,
  });
  assert.deepEqual(kind, { kind: "markdown", shouldFetch: true });
});

test("resolveFilePreviewKind: .md extension wins over octet-stream", () => {
  const kind = resolveFilePreviewKind({
    mime: "application/octet-stream",
    filename: "README.md",
  });
  assert.equal(kind.kind, "markdown");
  assert.equal(kind.shouldFetch, true);
});

test("resolveFilePreviewKind: .markdown extension is markdown", () => {
  assert.equal(
    resolveFilePreviewKind({ filename: "doc.markdown" }).kind,
    "markdown",
  );
});

test("resolveFilePreviewKind: HTML MIME is a rendered page, still fetched", () => {
  const kind = resolveFilePreviewKind({
    mime: "text/html",
    filename: "page.html",
  });
  assert.deepEqual(kind, { kind: "html", shouldFetch: true });
});

test("resolveFilePreviewKind: .html / .htm extensions are html", () => {
  assert.equal(
    resolveFilePreviewKind({
      mime: "application/octet-stream",
      filename: "index.html",
    }).kind,
    "html",
  );
  assert.equal(resolveFilePreviewKind({ filename: "legacy.HTM" }).kind, "html");
});

test("resolveFilePreviewKind: HTML wins over a .md suffix (file.md.html)", () => {
  assert.equal(
    resolveFilePreviewKind({
      mime: "text/html",
      filename: "file.md.html",
    }).kind,
    "html",
  );
});

test("resolveFilePreviewKind: 3.3 MiB HTML is under the 10 MiB cap", () => {
  const kind = resolveFilePreviewKind({
    mime: "text/html",
    filename: "report.html",
    size: Math.ceil(3.3 * 1024 * 1024),
  });
  assert.deepEqual(kind, { kind: "html", shouldFetch: true });
});

test("resolveFilePreviewKind: text/plain, csv, json are text", () => {
  assert.equal(
    resolveFilePreviewKind({ mime: "text/plain", filename: "a.txt" }).kind,
    "text",
  );
  assert.equal(
    resolveFilePreviewKind({ mime: "text/csv", filename: "a.csv" }).kind,
    "text",
  );
  assert.equal(
    resolveFilePreviewKind({ mime: "application/json", filename: "a.json" })
      .kind,
    "text",
  );
});

test("resolveFilePreviewKind: zip / pdf / office are binary (no fetch)", () => {
  for (const file of [
    { mime: "application/zip", filename: "a.zip" },
    { mime: "application/pdf", filename: "a.pdf" },
    {
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: "a.docx",
    },
  ]) {
    const kind = resolveFilePreviewKind(file);
    assert.deepEqual(
      kind,
      { kind: "unavailable", reason: "binary", shouldFetch: false },
      file.filename,
    );
  }
});

test("FILE_PREVIEW_MAX_BYTES is 10 MiB", () => {
  assert.equal(FILE_PREVIEW_MAX_BYTES, 10 * 1024 * 1024);
});

test("resolveFilePreviewKind: files just over the old 2 MiB cap still preview", () => {
  const kind = resolveFilePreviewKind({
    mime: "text/markdown",
    filename: "notes.md",
    size: 2 * 1024 * 1024 + 1,
  });
  assert.deepEqual(kind, { kind: "markdown", shouldFetch: true });
});

test("resolveFilePreviewKind: files at the 10 MiB cap still preview", () => {
  const kind = resolveFilePreviewKind({
    mime: "text/markdown",
    filename: "notes.md",
    size: FILE_PREVIEW_MAX_BYTES,
  });
  assert.deepEqual(kind, { kind: "markdown", shouldFetch: true });
});

test("resolveFilePreviewKind: oversized files refuse to load", () => {
  const kind = resolveFilePreviewKind({
    mime: "text/markdown",
    filename: "huge.md",
    size: FILE_PREVIEW_MAX_BYTES + 1,
  });
  assert.deepEqual(kind, {
    kind: "unavailable",
    reason: "too-large",
    shouldFetch: false,
  });
});

test("resolveFilePreviewKind: octet-stream without extension is sniffed", () => {
  const kind = resolveFilePreviewKind({
    mime: "application/octet-stream",
    filename: "blob",
  });
  assert.equal(kind.kind, "text");
  assert.equal(kind.shouldFetch, true);
});

test("planFilePreviewRender: HTML is a sandboxed srcdoc page, never /media/ src", () => {
  const plan = planFilePreviewRender({
    href: MEDIA_HTML,
    mime: "text/html",
    filename: "xss.html",
    size: 80,
  });
  assertRenderedHtmlPlan(plan);
  assert.equal(plan.shouldFetch, true);
});

test("planFilePreviewRender: HTML octet-stream .html is still sandboxed", () => {
  const plan = planFilePreviewRender({
    href: MEDIA_HTML,
    mime: "application/octet-stream",
    filename: "note.html",
  });
  assertRenderedHtmlPlan(plan);
});

test("htmlSafetyPlan: rendered page cannot upgrade to scripts or same-origin", () => {
  const plan = htmlSafetyPlan();
  assert.equal(plan.mode, "rendered");
  assert.equal(plan.allowScripts, false);
  assert.equal(plan.iframeSrc, null);
  assert.equal(plan.iframeSandbox, "");
  assert.equal(plan.navigateTo, null);
  assert.equal(plan.iframeSandbox.includes("allow-scripts"), false);
  assert.equal(plan.iframeSandbox.includes("allow-same-origin"), false);
});

test("htmlIframePlan: srcdoc only, empty sandbox, no navigable src", () => {
  const iframe = htmlIframePlan();
  assert.equal(iframe.src, null);
  assert.equal(iframe.srcdoc, true);
  assert.equal(iframe.sandbox, "");
  assert.equal(iframe.sandbox.includes("allow-scripts"), false);
});

test("htmlPreviewFrameProps: srcDoc from fetched bytes, no src field", () => {
  const props = htmlPreviewFrameProps("<h1>Hi</h1>");
  assert.equal(props.srcDoc, "<h1>Hi</h1>");
  assert.equal(props.sandbox, "");
  assert.equal(props.referrerPolicy, "no-referrer");
  assert.equal("src" in props, false);
  assert.equal(props.sandbox.includes("allow-scripts"), false);
});

test("planFilePreviewRender: markdown / text never grow an iframe", () => {
  const md = planFilePreviewRender({
    href: MEDIA_MD,
    mime: "text/markdown",
    filename: "notes.md",
  });
  assert.equal(md.kind, "markdown");
  assert.equal(md.iframe, null);
  assert.equal(md.navigateUrl, null);
  assert.equal(md.html, null);

  const txt = planFilePreviewRender({
    href: MEDIA_TXT,
    mime: "text/plain",
    filename: "notes.txt",
  });
  assert.equal(txt.kind, "text");
  assert.equal(txt.iframe, null);
  assert.equal(txt.navigateUrl, null);
});

test("planFilePreviewRender: binary keeps chrome-only unavailable state", () => {
  const plan = planFilePreviewRender({
    href: MEDIA_ZIP,
    mime: "application/zip",
    filename: "archive.zip",
    size: 4096,
  });
  assert.equal(plan.kind, "unavailable");
  assert.equal(plan.reason, "binary");
  assert.equal(plan.shouldFetch, false);
  assert.equal(plan.navigateUrl, null);
  assert.equal(plan.iframe, null);
});

test("decodeUtf8Text: accepts plain text and rejects NULs / invalid UTF-8", () => {
  assert.equal(decodeUtf8Text(new TextEncoder().encode("hello")), "hello");
  assert.equal(decodeUtf8Text(new Uint8Array()), "");
  assert.equal(decodeUtf8Text(new Uint8Array([0x68, 0x00, 0x69])), null);
  assert.equal(decodeUtf8Text(new Uint8Array([0xff, 0xfe, 0xfd])), null);
});

test("resolveFetchedPreview: valid UTF-8 octet-stream becomes text", () => {
  const plan = planFilePreviewRender({
    href: MEDIA_BIN,
    mime: "application/octet-stream",
    filename: "mystery",
  });
  const result = resolveFetchedPreview({
    plan,
    bytes: new TextEncoder().encode('{"ok":true}'),
  });
  assert.equal(result.kind, "text");
  assert.equal(result.text, '{"ok":true}');
});

test("resolveFetchedPreview: binary bytes stay unavailable", () => {
  const plan = planFilePreviewRender({
    href: MEDIA_BIN,
    mime: "application/octet-stream",
    filename: "mystery",
  });
  const result = resolveFetchedPreview({
    plan,
    bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]),
  });
  // ZIP magic is valid-ish Latin-1 but contains NUL at byte 4 → not-text.
  assert.equal(result.kind, "unavailable");
  assert.equal(result.reason, "not-text");
});

test("resolveFetchedPreview: fetched payload over the cap is refused", () => {
  const plan = planFilePreviewRender({
    href: MEDIA_MD,
    mime: "text/markdown",
    filename: "notes.md",
  });
  const bytes = new Uint8Array(FILE_PREVIEW_MAX_BYTES + 1);
  bytes.fill(0x61);
  const result = resolveFetchedPreview({ plan, bytes });
  assert.deepEqual(result, { kind: "unavailable", reason: "too-large" });
});

test("previewSourceLanguage: HTML source tab is highlighted as html", () => {
  assert.equal(
    previewSourceLanguage("html", "index.html", "text/html"),
    "html",
  );
  assert.equal(previewSourceLanguage("text", "data.json"), "json");
  assert.equal(previewSourceLanguage("markdown", "notes.md"), "");
});

test("FilePreviewDialog HTML iframe is sandboxed and never points at /media/", () => {
  const src = readFileSync(
    new URL("./markdown/FilePreviewDialog.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(src.includes("<iframe"), true);
  assert.equal(src.includes("srcDoc"), true);
  assert.equal(src.includes("sandbox={frame.sandbox}"), true);
  assert.equal(src.includes("allow-scripts"), false);
  assert.equal(src.includes("allow-same-origin"), false);
  // iframe src is never bound to the relay URL or fetchUrl.
  assert.equal(/<iframe[\s\S]*?\ssrc=\{/.test(src), false);
  assert.equal(/src=\{href\}/.test(src), false);
  assert.equal(/src=\{plan\.fetchUrl\}/.test(src), false);
  // Download is a <button> that invokes Tauri — not an <a href={mediaUrl}>.
  assert.equal(/<a\b[^>]*href=\{href\}/.test(src), false);
  assert.equal(/window\.location/.test(src), false);
  assert.equal(/location\.assign|location\.href/.test(src), false);
});

test("fileTypeLabel / formatFileSize / fileExtension helpers", () => {
  assert.equal(fileTypeLabel("text/markdown", "notes.md"), "Markdown");
  assert.equal(fileTypeLabel("text/html", "x.html"), "HTML");
  assert.equal(fileTypeLabel("application/pdf", "x.pdf"), "PDF");
  assert.equal(fileTypeLabel("application/octet-stream", "blob"), "File");
  assert.equal(formatFileSize(820), "820 B");
  assert.equal(formatFileSize(1270), "1.2 KB");
  assert.equal(formatFileSize(12 * 1024), "12 KB");
  assert.equal(fileExtension("legacy.HTM"), "htm");
  assert.equal(fileExtension("noext"), "");
});
