import * as React from "react";
import { Maximize2 } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";
import { useSmoothCorners } from "@/shared/ui/smoothCorners";

// Cells opt out of the message's wrap-anywhere so headers never break mid-word; the table takes its natural width
// (at least the bubble's) and scrolls horizontally instead of crushing columns. Expand opens a wide overlay where
// columns use their natural width with horizontal scroll.
const TABLE_CLASS =
  "w-max min-w-full border-collapse text-left text-sm [&_td]:[overflow-wrap:normal] [&_td]:[word-break:normal] [&_th]:[overflow-wrap:normal] [&_th]:[word-break:normal] [&_th]:whitespace-nowrap";

export function MarkdownTable({ children }: { children?: React.ReactNode }) {
  const tableBlockRef = React.useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  useSmoothCorners(tableBlockRef);

  return (
    <div className="group/table relative">
      <div
        ref={tableBlockRef}
        className="overflow-x-auto rounded-2xl border border-border/70 [&_td]:max-w-[28rem]"
        data-table-block=""
      >
        <table className={TABLE_CLASS}>{children}</table>
      </div>
      <button
        aria-label="Expand table"
        className="absolute right-1.5 top-1.5 rounded-md border border-border/60 bg-background/90 p-1 text-muted-foreground opacity-70 shadow-xs hover:text-foreground hover:opacity-100 group-hover/table:opacity-100"
        data-testid="markdown-table-expand"
        onClick={() => setExpanded(true)}
        title="Expand table"
        type="button"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
      {expanded ? (
        <Dialog onOpenChange={setExpanded} open>
          <DialogContent
            className="max-h-[calc(100dvh-2rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-[calc(100vw-2rem)] max-w-[min(96vw,1400px)] grid-rows-[auto_minmax(0,1fr)] p-4"
            data-testid="markdown-table-expanded"
          >
            <DialogTitle className="pr-8 text-sm font-semibold">Table</DialogTitle>
            <div className="min-h-0 overflow-auto rounded-xl border border-border/70 [&_td]:max-w-[40ch] [&_td]:align-top">
              <table className={TABLE_CLASS}>{children}</table>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
