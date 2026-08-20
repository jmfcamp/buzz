import * as React from "react";
import { Download, FileText } from "lucide-react";

import { formatFileSize } from "@/shared/ui/filePreview";
import { useSmoothCorners } from "@/shared/ui/smoothCorners";

import { FilePreviewDialog } from "./FilePreviewDialog";

/**
 * File card for a generic (non-image, non-video) attachment: icon, filename,
 * size, and a click target that opens an in-app preview.
 *
 * Click opens a Slack-style preview dialog (filename, type, size, Close,
 * Download). Download still goes through the native `download_file` Tauri
 * command from that dialog — never a plain `<a href>` / webview navigation
 * to the `/media/` blob (HTML attachments are a stored-XSS vector).
 */
export function FileCard({
  filename,
  href,
  mime,
  size,
}: {
  filename: string;
  href: string;
  mime?: string;
  size?: number;
}) {
  const cardRef = React.useRef<HTMLButtonElement | null>(null);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const sizeLabel = size != null ? formatFileSize(size) : "";
  useSmoothCorners(cardRef);

  return (
    <>
      <button
        ref={cardRef}
        type="button"
        onClick={(event) => {
          // Forum post cards (and similar list rows) wrap Markdown in a
          // clickable row. Without this, the row steals the click, navigates
          // away, and unmounts the preview before it can open.
          event.stopPropagation();
          setPreviewOpen(true);
        }}
        aria-label={`Preview ${filename}`}
        data-testid="file-card"
        className="my-1 inline-flex max-w-sm items-center gap-3 rounded-2xl border border-border/70 bg-muted/40 px-3 py-2 text-left no-underline transition-colors hover:bg-muted/70"
        style={{ borderRadius: "1rem" }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
          <FileText className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {filename}
          </span>
          {sizeLabel ? (
            <span className="block text-xs text-muted-foreground">
              {sizeLabel}
            </span>
          ) : null}
        </span>
        <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      <FilePreviewDialog
        filename={filename}
        href={href}
        mime={mime}
        onOpenChange={setPreviewOpen}
        open={previewOpen}
        size={size}
      />
    </>
  );
}
