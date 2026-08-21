import * as React from "react";
import { Download, Maximize2 } from "lucide-react";
import { toast } from "sonner";

import { fetchMediaBytes } from "@/shared/api/tauriMedia";
import { invokeTauri } from "@/shared/api/tauri";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { ChooserDialogContent } from "@/shared/ui/chooser-dialog-content";
import { Dialog } from "@/shared/ui/dialog";
import {
  fileTypeLabel,
  formatFileSize,
  htmlPreviewFrameProps,
  planFilePreviewRender,
  previewSourceLanguage,
  resolveFetchedPreview,
  type FilePreviewKind,
  type FilePreviewRenderPlan,
  type FilePreviewUnavailableReason,
} from "@/shared/ui/filePreview";
import { Spinner } from "@/shared/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

import { SyntaxHighlightedCode } from "./CodeBlock";

const Markdown = React.lazy(async () => {
  const mod = await import("@/shared/ui/markdown");
  return { default: mod.Markdown };
});

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      kind: Exclude<FilePreviewKind, "unavailable">;
      text: string;
    }
  | { status: "unavailable"; reason: FilePreviewUnavailableReason }
  | { status: "error"; message: string };

type PreviewTab = "preview" | "source";

function unavailableCopy(reason: FilePreviewUnavailableReason): string {
  if (reason === "too-large") {
    return "This file is too large to preview. Download it to open it locally.";
  }
  if (reason === "not-text") {
    return "This file isn't valid text, so there's nothing to preview.";
  }
  return "No preview is available for this file type.";
}

function downloadAttachment(url: string, filename: string) {
  invokeTauri("download_file", { url, filename }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : "Download failed";
    toast.error(msg);
  });
}

function PreviewSourceTabs({ kind }: { kind: "html" | "markdown" }) {
  return (
    <TabsList data-preview-kind={kind} data-testid="file-preview-tabs">
      <TabsTrigger
        data-testid={
          kind === "html"
            ? "file-preview-html-tab-preview"
            : "file-preview-tab-preview"
        }
        value="preview"
      >
        Preview
      </TabsTrigger>
      <TabsTrigger
        data-testid={
          kind === "html"
            ? "file-preview-html-tab-source"
            : "file-preview-tab-source"
        }
        value="source"
      >
        Source
      </TabsTrigger>
    </TabsList>
  );
}

export function FilePreviewDialog({
  filename,
  href,
  mime,
  onOpenChange,
  open,
  size,
}: {
  filename: string;
  href: string;
  mime?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  size?: number;
}) {
  const plan = React.useMemo(
    () => planFilePreviewRender({ href, mime, filename, size }),
    [filename, href, mime, size],
  );
  const [state, setState] = React.useState<PreviewState>({ status: "idle" });
  const [tab, setTab] = React.useState<PreviewTab>("preview");
  const [fullscreen, setFullscreen] = React.useState(false);

  const tabKind =
    plan.kind === "html" || plan.kind === "markdown" ? plan.kind : null;

  React.useEffect(() => {
    if (!open) {
      setState({ status: "idle" });
      setTab("preview");
      setFullscreen(false);
      return;
    }
    if (!plan.shouldFetch) {
      setState({
        status: "unavailable",
        reason: plan.reason ?? "binary",
      });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });
    fetchMediaBytes(plan.fetchUrl)
      .then((bytes) => {
        if (cancelled) return;
        const resolved = resolveFetchedPreview({ plan, bytes });
        if (resolved.kind === "unavailable") {
          setState({
            status: "unavailable",
            reason: resolved.reason ?? "binary",
          });
          return;
        }
        setState({
          status: "ready",
          kind: resolved.kind,
          text: resolved.text ?? "",
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Couldn't load a preview";
        setState({ status: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [open, plan]);

  const typeLabel = fileTypeLabel(mime, filename);
  const sizeLabel = size != null ? formatFileSize(size) : "";
  const subtitle = [typeLabel, sizeLabel].filter(Boolean).join(" · ");
  const showHtmlFullscreen =
    plan.kind === "html" && (fullscreen || tab === "preview");

  const headerTrailing = tabKind ? (
    <>
      <PreviewSourceTabs kind={tabKind} />
      {showHtmlFullscreen ? (
        fullscreen ? (
          <Button
            data-testid="file-preview-exit-fullscreen"
            onClick={() => setFullscreen(false)}
            size="sm"
            type="button"
            variant="outline"
          >
            Exit
          </Button>
        ) : (
          <Button
            aria-label="Fullscreen"
            data-testid="file-preview-fullscreen"
            onClick={() => setFullscreen(true)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Maximize2 />
          </Button>
        )
      ) : null}
    </>
  ) : null;

  const dialog = (
    <ChooserDialogContent
      className={cn(
        plan.kind === "html" ? "max-w-5xl" : "max-w-3xl",
        fullscreen &&
          "h-[calc(100vh-2rem)] max-h-none w-[calc(100vw-2rem)] max-w-none",
      )}
      contentClassName={cn(
        "py-3",
        (plan.kind === "html" || fullscreen) && "flex min-h-0 flex-1 flex-col",
      )}
      data-fullscreen={fullscreen ? "true" : "false"}
      data-testid="file-preview-dialog"
      headerInline
      headerSubtitle={subtitle}
      headerTestId="file-preview-header"
      headerTrailing={headerTrailing}
      onEscapeKeyDown={(event) => {
        if (!fullscreen) return;
        event.preventDefault();
        setFullscreen(false);
      }}
      scrollAreaClassName={cn(
        plan.kind === "html" || fullscreen ? "min-h-0" : "min-h-48",
        (plan.kind === "html" || fullscreen) && "flex flex-col",
      )}
      scrollAreaTestId="file-preview-body"
      title={filename}
      titleClassName="text-base"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Close
          </Button>
          <Button
            data-testid="file-preview-download"
            onClick={() => downloadAttachment(href, filename)}
            type="button"
          >
            <Download />
            Download
          </Button>
        </div>
      }
      footerTestId="file-preview-footer"
    >
      <FilePreviewBody
        filename={filename}
        fullscreen={fullscreen}
        mime={mime}
        plan={plan}
        state={state}
      />
    </ChooserDialogContent>
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      {tabKind ? (
        <Tabs
          className="contents"
          onValueChange={(value) => setTab(value as PreviewTab)}
          value={tab}
        >
          {dialog}
        </Tabs>
      ) : (
        dialog
      )}
    </Dialog>
  );
}

function FilePreviewBody({
  filename,
  fullscreen,
  mime,
  plan,
  state,
}: {
  filename: string;
  fullscreen: boolean;
  mime?: string;
  plan: FilePreviewRenderPlan;
  state: PreviewState;
}) {
  if (state.status === "loading" || state.status === "idle") {
    return (
      <div
        className="flex min-h-48 items-center justify-center text-muted-foreground"
        data-testid="file-preview-loading"
      >
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <Unavailable
        data-testid="file-preview-error"
        title="Couldn't load a preview"
        detail={state.message}
      />
    );
  }

  if (state.status === "unavailable") {
    return (
      <Unavailable
        data-preview-reason={state.reason}
        data-testid="file-preview-unavailable"
        title="No preview"
        detail={unavailableCopy(state.reason)}
      />
    );
  }

  if (state.kind === "html") {
    return (
      <HtmlPreview
        filename={filename}
        fullscreen={fullscreen}
        mime={mime}
        plan={plan}
        text={state.text}
      />
    );
  }

  if (state.kind === "markdown") {
    return (
      <MarkdownPreview filename={filename} mime={mime} text={state.text} />
    );
  }

  return (
    <SourcePreview
      filename={filename}
      kind={state.kind}
      mime={mime}
      text={state.text}
    />
  );
}

function HtmlPreview({
  filename,
  fullscreen,
  mime,
  plan,
  text,
}: {
  filename: string;
  fullscreen: boolean;
  mime?: string;
  plan: FilePreviewRenderPlan;
  text: string;
}) {
  const html = plan.html;
  const iframe = plan.iframe;
  // Refuse to mount a frame unless the plan is the locked rendered contract.
  if (
    !html ||
    !iframe ||
    html.mode !== "rendered" ||
    html.allowScripts ||
    html.navigateTo != null ||
    html.iframeSrc != null ||
    iframe.src != null ||
    iframe.sandbox !== ""
  ) {
    return (
      <Unavailable
        data-testid="file-preview-unavailable"
        detail="This HTML file cannot be previewed safely."
        title="No preview"
      />
    );
  }

  const frame = htmlPreviewFrameProps(text);

  return (
    <>
      <TabsContent
        className={cn("mt-0 min-h-0", fullscreen && "flex flex-1 flex-col")}
        forceMount
        value="preview"
      >
        <div className={cn(fullscreen && "relative min-h-0 flex-1")}>
          <iframe
            className={cn(
              "w-full rounded-2xl border border-border/70 bg-background",
              fullscreen ? "absolute inset-0 h-full" : "h-[min(60vh,36rem)]",
            )}
            data-preview-kind="html"
            data-testid="file-preview-html"
            referrerPolicy={frame.referrerPolicy}
            sandbox={frame.sandbox}
            srcDoc={frame.srcDoc}
            title={`Preview of ${filename}`}
          />
        </div>
      </TabsContent>
      <TabsContent className="mt-0" value="source">
        <SourcePreview
          filename={filename}
          kind="html"
          mime={mime}
          text={text}
        />
      </TabsContent>
    </>
  );
}

function MarkdownPreview({
  filename,
  mime,
  text,
}: {
  filename: string;
  mime?: string;
  text: string;
}) {
  return (
    <>
      <TabsContent className="mt-0 min-w-0" value="preview">
        <div
          className="min-w-0"
          data-preview-kind="markdown"
          data-testid="file-preview-markdown"
        >
          <React.Suspense
            fallback={
              <div className="flex min-h-48 items-center justify-center">
                <Spinner className="h-6 w-6" />
              </div>
            }
          >
            <Markdown content={text} interactive={false} />
          </React.Suspense>
        </div>
      </TabsContent>
      <TabsContent className="mt-0" value="source">
        <SourcePreview
          filename={filename}
          kind="markdown"
          mime={mime}
          text={text}
        />
      </TabsContent>
    </>
  );
}

function SourcePreview({
  filename,
  kind,
  mime,
  text,
}: {
  filename: string;
  kind: Exclude<FilePreviewKind, "unavailable">;
  mime?: string;
  text: string;
}) {
  const language = previewSourceLanguage(kind, filename, mime);
  return (
    <pre
      className="min-h-48 overflow-auto rounded-2xl border border-border/70 bg-muted/60 px-3 py-3"
      data-preview-kind={kind === "html" ? "html-source" : kind}
      data-testid="file-preview-source"
    >
      {language ? (
        <SyntaxHighlightedCode code={text} language={language} />
      ) : (
        <code className="block whitespace-pre-wrap font-mono text-sm text-foreground">
          {text}
        </code>
      )}
    </pre>
  );
}

function Unavailable({
  detail,
  title,
  ...rest
}: React.ComponentPropsWithoutRef<"div"> & {
  detail: string;
  title: string;
}) {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center gap-2 px-4 text-center"
      {...rest}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{detail}</p>
      <p className="text-xs text-muted-foreground">
        Use Download to save the file.
      </p>
    </div>
  );
}
