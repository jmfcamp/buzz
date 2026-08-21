/**
 * Pure classification for Slack-style generic-file previews.
 *
 * FileCard click opens an in-app preview dialog. This module decides *what*
 * that dialog may show — never how to fetch. Bytes still come from the
 * authenticated Tauri `fetch_media_bytes` / `download_file` path.
 *
 * HTML renders as a laid-out page in a uniquely origin-isolated iframe
 * (`srcdoc` from fetched bytes, empty sandbox). The main Buzz webview never
 * navigates to the blob, and the iframe `src` is never the relay `/media/`
 * URL. The sandbox token list is the empty string — it cannot grow script
 * or same-origin privileges without changing this type.
 */

/** Refuse to materialize attachments larger than 10 MiB in the preview pane. */
export const FILE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The only legal iframe sandbox for HTML previews. An empty string means
 * unique opaque origin, no scripts, no same-origin, no popups, no forms.
 * There is no token list a caller can append to.
 */
export const HTML_PREVIEW_IFRAME_SANDBOX = "" as const;

export type FilePreviewKind = "markdown" | "html" | "text" | "unavailable";

export type FilePreviewUnavailableReason = "binary" | "too-large" | "not-text";

export type HtmlIframeSandbox = typeof HTML_PREVIEW_IFRAME_SANDBOX;

/**
 * Locked-down iframe descriptor for rendered HTML. `src` is always null so
 * the dialog cannot point the frame at `fetchUrl` / `/media/`. Content is
 * assigned via `srcdoc` from bytes already fetched through Tauri.
 */
export type HtmlIframePlan = {
  src: null;
  srcdoc: true;
  sandbox: HtmlIframeSandbox;
};

/**
 * HTML preview contract. Default view is a rendered page; scripts stay
 * structurally forbidden. Every field that could navigate the webview or
 * load the relay URL in a frame is fixed to a safe value.
 */
export type HtmlSafetyPlan = {
  mode: "rendered";
  iframeSrc: null;
  iframeSandbox: HtmlIframeSandbox;
  navigateTo: null;
  allowScripts: false;
};

export type FilePreviewRenderPlan = {
  kind: FilePreviewKind;
  reason?: FilePreviewUnavailableReason;
  /** True when the dialog should fetch bytes through Tauri (never `<a href>`). */
  shouldFetch: boolean;
  /**
   * Relay `/media/` URL used only as an argument to `fetch_media_bytes` or
   * `download_file`. Never assign this to `location`, `<a href>`, or
   * `<iframe src>`.
   */
  fetchUrl: string;
  /** Always null — the main webview must never navigate to the blob. */
  navigateUrl: null;
  /** HTML only: srcdoc iframe with an empty sandbox. All other kinds: null. */
  iframe: HtmlIframePlan | null;
  html: HtmlSafetyPlan | null;
};

const HTML_EXTENSIONS = new Set(["html", "htm"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);
const TEXT_EXTENSIONS = new Set([
  "txt",
  "text",
  "csv",
  "tsv",
  "json",
  "xml",
  "yml",
  "yaml",
  "toml",
  "ini",
  "cfg",
  "log",
  "css",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "rs",
  "go",
  "rb",
  "java",
  "kt",
  "swift",
  "sh",
  "bash",
  "zsh",
  "env",
  "svg",
]);

const BINARY_EXTENSIONS = new Set([
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "exe",
  "dll",
  "so",
  "dylib",
  "dmg",
  "iso",
  "wasm",
  "bin",
  "class",
  "jar",
  "apk",
  "ipa",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "mp3",
  "wav",
  "flac",
  "ogg",
  "m4a",
]);

const BINARY_MIME_PREFIXES = [
  "application/pdf",
  "application/zip",
  "application/x-zip",
  "application/gzip",
  "application/x-tar",
  "application/x-7z",
  "application/x-rar",
  "application/msword",
  "application/vnd.ms-",
  "application/vnd.openxmlformats-officedocument.",
  "application/vnd.oasis.opendocument.",
  "application/wasm",
  "audio/",
  "font/",
];

const TYPE_LABELS: Record<string, string> = {
  md: "Markdown",
  markdown: "Markdown",
  html: "HTML",
  htm: "HTML",
  txt: "Text",
  text: "Text",
  csv: "CSV",
  tsv: "TSV",
  json: "JSON",
  xml: "XML",
  pdf: "PDF",
  zip: "ZIP",
  doc: "Word",
  docx: "Word",
  xls: "Excel",
  xlsx: "Excel",
  ppt: "PowerPoint",
  pptx: "PowerPoint",
};

/** Lowercased path/filename extension, without the dot. */
export function fileExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot >= base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

function normalizeMime(mime: string | undefined): string {
  return (mime ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function isHtml(mime: string, ext: string): boolean {
  return mime === "text/html" || HTML_EXTENSIONS.has(ext);
}

function isMarkdown(mime: string, ext: string): boolean {
  return (
    mime === "text/markdown" ||
    mime === "text/x-markdown" ||
    MARKDOWN_EXTENSIONS.has(ext)
  );
}

function isTextish(mime: string, ext: string): boolean {
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (mime === "application/json" || mime === "application/xml") return true;
  if (mime === "application/javascript" || mime === "text/javascript") {
    return true;
  }
  if (mime.startsWith("text/") && mime !== "text/html") return true;
  return false;
}

function isKnownBinary(mime: string, ext: string): boolean {
  if (BINARY_EXTENSIONS.has(ext)) return true;
  if (!mime || mime === "application/octet-stream") {
    return BINARY_EXTENSIONS.has(ext);
  }
  return BINARY_MIME_PREFIXES.some(
    (prefix) => mime === prefix || mime.startsWith(prefix),
  );
}

export function htmlIframePlan(): HtmlIframePlan {
  return {
    src: null,
    srcdoc: true,
    sandbox: HTML_PREVIEW_IFRAME_SANDBOX,
  };
}

export function htmlSafetyPlan(): HtmlSafetyPlan {
  return {
    mode: "rendered",
    iframeSrc: null,
    iframeSandbox: HTML_PREVIEW_IFRAME_SANDBOX,
    navigateTo: null,
    allowScripts: false,
  };
}

/**
 * Props the dialog may pass to the HTML preview iframe. `src` is omitted
 * on purpose — callers must not add a navigable URL.
 */
export function htmlPreviewFrameProps(srcdoc: string): {
  referrerPolicy: "no-referrer";
  sandbox: HtmlIframeSandbox;
  srcDoc: string;
} {
  return {
    referrerPolicy: "no-referrer",
    sandbox: HTML_PREVIEW_IFRAME_SANDBOX,
    srcDoc: srcdoc,
  };
}

/**
 * Decide the preview kind from imeta MIME + filename before any bytes load.
 * `application/octet-stream` without a known extension is treated as
 * sniffable text: the dialog fetches and then `decodeUtf8Text`.
 */
export function resolveFilePreviewKind(input: {
  mime?: string;
  filename: string;
  size?: number;
}): {
  kind: FilePreviewKind;
  reason?: FilePreviewUnavailableReason;
  shouldFetch: boolean;
} {
  if (input.size != null && input.size > FILE_PREVIEW_MAX_BYTES) {
    return { kind: "unavailable", reason: "too-large", shouldFetch: false };
  }

  const mime = normalizeMime(input.mime);
  const ext = fileExtension(input.filename);

  // HTML wins over every other guess so a `.md.html` (or text/html + .md)
  // attachment can never fall through to the markdown renderer as a live page.
  if (isHtml(mime, ext)) {
    return { kind: "html", shouldFetch: true };
  }
  if (isMarkdown(mime, ext)) {
    return { kind: "markdown", shouldFetch: true };
  }
  if (isTextish(mime, ext)) {
    return { kind: "text", shouldFetch: true };
  }
  if (isKnownBinary(mime, ext)) {
    return { kind: "unavailable", reason: "binary", shouldFetch: false };
  }

  // Unknown / sniffed octet-stream: fetch and try UTF-8.
  return { kind: "text", shouldFetch: true };
}

/**
 * Build the dialog's render plan. HTML plans render in a srcdoc iframe
 * whose sandbox cannot be upgraded to scripts or same-origin. There is no
 * field a caller can set to navigate the main webview or load `/media/`.
 */
export function planFilePreviewRender(input: {
  href: string;
  mime?: string;
  filename: string;
  size?: number;
}): FilePreviewRenderPlan {
  const resolved = resolveFilePreviewKind(input);
  const isHtmlKind = resolved.kind === "html";
  return {
    kind: resolved.kind,
    reason: resolved.reason,
    shouldFetch: resolved.shouldFetch,
    fetchUrl: input.href,
    navigateUrl: null,
    iframe: isHtmlKind ? htmlIframePlan() : null,
    html: isHtmlKind ? htmlSafetyPlan() : null,
  };
}

/**
 * Decode attachment bytes as UTF-8 text. Returns `null` for NULs or invalid
 * UTF-8 so sniffed `application/octet-stream` binaries stay in the
 * "no preview" state instead of dumping replacement characters.
 */
export function decodeUtf8Text(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return "";
  for (const byte of bytes) {
    if (byte === 0) return null;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** After fetch: honor the size cap and UTF-8 sniff for unknown binaries. */
export function resolveFetchedPreview(input: {
  plan: FilePreviewRenderPlan;
  bytes: Uint8Array;
}): {
  kind: FilePreviewKind;
  reason?: FilePreviewUnavailableReason;
  text?: string;
} {
  if (input.bytes.byteLength > FILE_PREVIEW_MAX_BYTES) {
    return { kind: "unavailable", reason: "too-large" };
  }

  const text = decodeUtf8Text(input.bytes);
  if (text == null) {
    return { kind: "unavailable", reason: "not-text" };
  }

  if (input.plan.kind === "unavailable") {
    return { kind: "unavailable", reason: input.plan.reason ?? "binary" };
  }

  return { kind: input.plan.kind, text };
}

/** Shiki language id for source-style previews; empty → plain monospace. */
export function previewSourceLanguage(
  kind: FilePreviewKind,
  filename: string,
  mime?: string,
): string {
  if (kind === "html") return "html";
  const ext = fileExtension(filename);
  const mimeNorm = normalizeMime(mime);
  if (kind === "text") {
    if (ext === "json" || mimeNorm === "application/json") return "json";
    if (ext === "css") return "css";
    if (ext === "xml" || mimeNorm === "application/xml") return "xml";
    if (ext === "js" || ext === "mjs" || ext === "cjs") return "javascript";
    if (ext === "ts" || ext === "mts") return "typescript";
    if (ext === "tsx") return "tsx";
    if (ext === "jsx") return "jsx";
    if (ext === "py") return "python";
    if (ext === "rs") return "rust";
    if (ext === "go") return "go";
    if (ext === "sh" || ext === "bash" || ext === "zsh") return "bash";
    if (ext === "yml" || ext === "yaml") return "yaml";
    if (ext === "svg") return "xml";
  }
  return "";
}

/** Human-readable type for the preview chrome (filename already shown). */
export function fileTypeLabel(
  mime: string | undefined,
  filename: string,
): string {
  const ext = fileExtension(filename);
  if (ext && TYPE_LABELS[ext]) return TYPE_LABELS[ext];
  if (ext) return ext.toUpperCase();
  const mimeNorm = normalizeMime(mime);
  if (mimeNorm === "text/markdown" || mimeNorm === "text/x-markdown") {
    return "Markdown";
  }
  if (mimeNorm === "text/html") return "HTML";
  if (mimeNorm === "application/json") return "JSON";
  if (mimeNorm === "application/pdf") return "PDF";
  const subtype = mimeNorm.split("/")[1];
  if (!subtype || subtype === "octet-stream") return "File";
  return subtype.split("+")[0]?.toUpperCase() || "File";
}

/** Human-readable byte size: "820 B", "12.4 KB", "3.1 MB". */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} ${units[i]}`;
}
