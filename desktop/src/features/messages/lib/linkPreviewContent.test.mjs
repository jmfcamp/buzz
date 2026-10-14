import assert from "node:assert/strict";
import test from "node:test";

import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

import { extractSupportedLinkPreviews } from "../../../shared/lib/linkPreview.ts";
import { buildPreviewUpdate } from "./linkPreviewContent.ts";

const schema = getSchema([
  StarterKit.configure({
    hardBreak: { keepMarks: true },
    heading: false,
    trailingNode: false,
    link: false,
  }),
]);
const para = (...c) => schema.nodes.paragraph.create(null, c);
const t = (s) => schema.text(s);
const code = (s) => schema.text(s, [schema.marks.code.create()]);
const doc = (...c) => schema.nodes.doc.create(null, c);
const hrefs = (d) =>
  extractSupportedLinkPreviews(buildPreviewUpdate(d, 0).linkPreviewContent).map(
    (p) => p.href,
  );

test("URLs inside inline code never become preview candidates", () => {
  const d = doc(
    para(
      t("Add "),
      code(
        "Content-Security-Policy: frame-ancestors 'self' https://hulabuzz.huladesk.com",
      ),
      t(" to every page response."),
    ),
  );
  assert.deepEqual(hrefs(d), []);
  // The plain-text projection (cursor/mentions) is unchanged.
  assert.match(buildPreviewUpdate(d, 0).text, /https:\/\/hulabuzz/);
});

test("URLs inside code blocks never become preview candidates", () => {
  const d = doc(
    schema.nodes.codeBlock.create(null, [t("curl https://example.com/x")]),
    para(t("see https://wikipedia.org/wiki/A")),
  );
  assert.deepEqual(hrefs(d), ["https://wikipedia.org/wiki/A"]);
});

test("plain URLs still preview", () => {
  assert.deepEqual(hrefs(doc(para(t("see https://example.com/a b")))), [
    "https://example.com/a",
  ]);
});
