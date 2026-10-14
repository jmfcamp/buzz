import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";

import { buildPlainTextProjection } from "./plainTextProjection";

function isCodeMark(mark: Mark): boolean {
  return mark.type.name === "code" || mark.type.spec.code === true;
}

/**
 * Text eligible for link previews. Inline code and code blocks are masked:
 * the sent markdown wraps them in backticks/fences, and both the composer
 * extractor and recipients treat code as hidden, so a URL inside code must
 * never produce a preview snapshot (the relay would reject the canonical URL
 * as absent from the content, failing the whole send).
 */
export function buildLinkPreviewSearchText(doc: ProseMirrorNode): string {
  const blocks: string[] = [];
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) {
      blocks.push("");
      return false;
    }
    let text = "";
    node.forEach((child) => {
      if (child.isText) {
        text += child.marks.some(isCodeMark)
          ? " ".repeat(child.text?.length ?? 0)
          : (child.text ?? "");
      } else {
        text += " ";
      }
    });
    blocks.push(text);
    return false;
  });
  return blocks.join("\n");
}

export function buildPreviewUpdate(
  doc: ProseMirrorNode,
  selectionAnchor: number,
) {
  const projection = buildPlainTextProjection(doc);
  const plainText = projection.text;
  const hrefs = new Set<string>();
  doc.descendants((node) => {
    if (
      !node.isText ||
      node.marks.some(
        (mark) => mark.type.name === "spoiler" || isCodeMark(mark),
      )
    )
      return;
    const href = node.marks.find((mark) => mark.type.name === "link")?.attrs
      .href;
    if (typeof href === "string") hrefs.add(href);
  });
  return {
    cursor: projection.mapPMToTextOffset(selectionAnchor),
    linkPreviewContent: [buildLinkPreviewSearchText(doc), ...hrefs].join("\n"),
    text: plainText,
  };
}
