/**
 * Pure classification for Slack-style generic-file previews.
 *
 * FileCard click opens an in-app preview dialog. This module decides *what*
 * that dialog may show — never how to fetch. Bytes still come from the
 * authenticated Tauri `fetch_media_bytes` / `download_file` path.
 *
 * HTML renders as a laid-out page in a uniquely origin-isolated iframe.
 * Guest bytes are rewritten (bootstrap + guest CSP) and served from
 * `html-preview://` (packaged Tauri) or a `blob:` URL (dev / E2E) — never
 * assigned as `srcdoc` under the app-shell CSP, and never pointed at the
 * relay `/media/` URL. Parent `script-src` has no `'unsafe-inline'`; srcdoc
 * frames inherit that policy and silently drop guest scripts, onclick, and
 * most routers. A distinct origin carries its own CSP so inline JS, CSS
 * animation, and in-page hash navigation work inside the frame.
 *
 * The sandbox must never include `allow-same-origin` (scripts + same-origin
 * can become a parent escape) or top-navigation tokens. The main Buzz
 * webview never navigates to the blob.
 */

/** Refuse to materialize attachments larger than 10 MiB in the preview pane. */
export const FILE_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

/**
 * The only legal iframe sandbox for HTML previews. Scripts/forms/modals/popups
 * run in the frame; the origin stays opaque. `allow-popups-to-escape-sandbox`
 * lets `target=_blank` https links open a real OS/browser window instead of a
 * nested sandboxed popup. Callers cannot append tokens.
 */
export const HTML_PREVIEW_IFRAME_SANDBOX =
  "allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox" as const;

/** Custom scheme that serves one prepared HTML attachment (Tauri only). */
export const HTML_PREVIEW_PROTOCOL_SCHEME = "html-preview";

/**
 * CSP for the *guest* document only (HTTP header on `html-preview://` and a
 * matching `<meta>` in the rewritten HTML). This must never be copied onto
 * the Hula Buzz app shell — parent `script-src` stays free of `'unsafe-inline'`.
 */
export const HTML_PREVIEW_GUEST_CSP =
  "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'unsafe-inline' data:; img-src data: blob: https: http:; font-src data: blob: https: http:; media-src data: blob: https: http:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'";

const HTML_PREVIEW_FORBIDDEN_SANDBOX_TOKENS = [
  "allow-same-origin",
  "allow-top-navigation",
  "allow-top-navigation-by-user-activation",
] as const;

export type FilePreviewKind = "markdown" | "html" | "text" | "unavailable";

export type FilePreviewUnavailableReason = "binary" | "too-large" | "not-text";

export type HtmlIframeSandbox = typeof HTML_PREVIEW_IFRAME_SANDBOX;

/**
 * Locked-down iframe descriptor for rendered HTML. `src` is always null at
 * plan time so the dialog cannot point the frame at `fetchUrl` / `/media/`.
 * After fetch, the dialog assigns an isolated `blob:` / `html-preview:` URL
 * — never `srcdoc` (parent CSP would kill guest scripts).
 */
export type HtmlIframePlan = {
  src: null;
  srcdoc: false;
  isolatedOrigin: true;
  sandbox: HtmlIframeSandbox;
};

/** How an in-preview `<a href>` should be handled by the guest bootstrap. */
export type HtmlPreviewHrefKind =
  | "same-document"
  | "external"
  | "other-file"
  | "ignore";

/**
 * HTML preview contract. Default view is a rendered page; guest JS is
 * allowed only inside the uniquely-origin iframe. Every field that could
 * navigate the webview or load the relay URL in a frame is fixed to a
 * safe value.
 */
export type HtmlSafetyPlan = {
  mode: "rendered";
  iframeSrc: null;
  iframeSandbox: HtmlIframeSandbox;
  navigateTo: null;
  allowScripts: true;
};

/**
 * True only for the locked preview sandbox: scripts on, same-origin and
 * top-navigation off, exact token list.
 */
export function isLockedHtmlPreviewSandbox(sandbox: string): boolean {
  if (sandbox !== HTML_PREVIEW_IFRAME_SANDBOX) return false;
  const tokens = sandbox.split(/\s+/).filter(Boolean);
  if (!tokens.includes("allow-scripts")) return false;
  return !HTML_PREVIEW_FORBIDDEN_SANDBOX_TOKENS.some((token) =>
    tokens.includes(token),
  );
}

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
  /** HTML only: isolated-origin iframe with the locked script sandbox. Other kinds: null. */
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
    srcdoc: false,
    isolatedOrigin: true,
    sandbox: HTML_PREVIEW_IFRAME_SANDBOX,
  };
}

export function htmlSafetyPlan(): HtmlSafetyPlan {
  return {
    mode: "rendered",
    iframeSrc: null,
    iframeSandbox: HTML_PREVIEW_IFRAME_SANDBOX,
    navigateTo: null,
    allowScripts: true,
  };
}

/**
 * Props the dialog may pass to the HTML preview iframe. `src` must be an
 * isolated `blob:` or `html-preview:` URL — never `fetchUrl` / `/media/`.
 * `srcDoc` is omitted so parent CSP cannot apply to a srcdoc guest.
 */
export function htmlPreviewFrameProps(isolatedSrc: string): {
  referrerPolicy: "no-referrer";
  sandbox: HtmlIframeSandbox;
  src: string;
} {
  return {
    referrerPolicy: "no-referrer",
    sandbox: HTML_PREVIEW_IFRAME_SANDBOX,
    src: isolatedSrc,
  };
}

/** `html-preview://localhost/{id}/` — Windows WebView2 maps this to http://html-preview.localhost. */
export function htmlPreviewProtocolSrc(id: string): string {
  return `${HTML_PREVIEW_PROTOCOL_SCHEME}://localhost/${id}/`;
}

/** Object URL for rewritten guest HTML. Caller must `revokeObjectURL`. */
export function createHtmlPreviewObjectUrl(html: string): string {
  return URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
}

/**
 * True only for the isolated origins this preview is allowed to frame.
 * Relay `/media/` URLs and arbitrary https are rejected.
 */
export function isSafeHtmlPreviewFrameSrc(src: string): boolean {
  if (!src || src.includes("/media/")) return false;
  if (src.startsWith("blob:")) return true;
  try {
    const url = new URL(src);
    if (url.protocol === `${HTML_PREVIEW_PROTOCOL_SCHEME}:`) {
      return url.hostname === "localhost" || url.hostname === "";
    }
    return (
      url.protocol === "http:" && url.hostname === "html-preview.localhost"
    );
  } catch {
    return false;
  }
}

/**
 * Classify a guest `<a href>` the way the injected bootstrap will. Hash /
 * same-document targets stay in-frame; http(s) may popup; anything else is
 * a missing second file and must not leave the preview.
 */
export function classifyHtmlPreviewHref(
  href: string,
  baseUri: string,
): HtmlPreviewHrefKind {
  const trimmed = href.trim();
  if (!trimmed || trimmed.toLowerCase().startsWith("javascript:")) {
    return "ignore";
  }
  let url: URL;
  try {
    url = new URL(trimmed, baseUri);
  } catch {
    return "other-file";
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    return "external";
  }
  let here: URL;
  try {
    here = new URL(baseUri);
  } catch {
    return "other-file";
  }
  if (
    url.protocol === here.protocol &&
    url.host === here.host &&
    url.pathname === here.pathname &&
    url.search === here.search
  ) {
    return "same-document";
  }
  return "other-file";
}

const HTML_PREVIEW_BOOT_ATTR = "data-hb-html-preview-boot";

/**
 * Guest click / hash bootstrap. Injected as the first script so in-page
 * `#id` links scroll even when History is flaky, https links popup instead
 * of replacing the frame, and relative second-file links stay a no-op.
 */
export const HTML_PREVIEW_BOOTSTRAP_SOURCE = `(function(){
  if (window.__HB_HTML_PREVIEW_BOOT__) return;
  window.__HB_HTML_PREVIEW_BOOT__ = 1;
  function banner(msg){
    var el = document.getElementById("hb-html-preview-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "hb-html-preview-banner";
      el.setAttribute("role", "status");
      el.style.cssText = "position:sticky;top:0;z-index:2147483647;padding:8px 12px;background:#fff3cd;color:#222;font:14px/1.4 system-ui,sans-serif;border-bottom:1px solid #e0c36c";
      document.documentElement.insertBefore(el, document.documentElement.firstChild);
    }
    el.textContent = msg;
  }
  function classify(href){
    var trimmed = String(href || "").trim();
    if (!trimmed || trimmed.toLowerCase().indexOf("javascript:") === 0) return "ignore";
    var url, here;
    try { url = new URL(trimmed, document.baseURI); } catch (e) { return "other-file"; }
    if (url.protocol === "http:" || url.protocol === "https:") return "external";
    try { here = new URL(document.baseURI); } catch (e2) { return "other-file"; }
    if (url.protocol === here.protocol && url.host === here.host && url.pathname === here.pathname && url.search === here.search) return "same-document";
    return "other-file";
  }
  function scrollToHash(hash){
    if (!hash || hash === "#") return;
    var id = hash.charAt(0) === "#" ? hash.slice(1) : hash;
    try { id = decodeURIComponent(id); } catch (e) {}
    var target = document.getElementById(id) || document.getElementsByName(id)[0];
    if (target && target.scrollIntoView) target.scrollIntoView();
  }
  document.addEventListener("click", function(event){
    var t = event.target;
    var a = t && t.closest ? t.closest("a[href]") : null;
    if (!a || event.defaultPrevented) return;
    var kind = classify(a.getAttribute("href") || "");
    if (kind === "ignore") return;
    if (kind === "external") {
      event.preventDefault();
      try { window.open(new URL(a.getAttribute("href") || "", document.baseURI).href, "_blank", "noopener,noreferrer"); } catch (e) {}
      return;
    }
    if (kind === "same-document") {
      var url = new URL(a.getAttribute("href") || "", document.baseURI);
      if (url.hash) {
        event.preventDefault();
        scrollToHash(url.hash);
        try { location.hash = url.hash; } catch (e2) {}
      }
      return;
    }
    event.preventDefault();
    banner("This preview is a single file, so links to other files cannot be opened here.");
  }, true);
  window.addEventListener("hashchange", function(){ scrollToHash(location.hash); });
  if (location.hash) scrollToHash(location.hash);
})();`;

function stripGuestCspAndBase(html: string): string {
  return html
    .replace(
      /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi,
      "",
    )
    .replace(/<base\b[^>]*>/gi, "");
}

/**
 * Rewrite fetched HTML so the isolated-origin document can run scripts and
 * handle in-page navigation. Strips a guest CSP/`<base>` that would fight
 * the preview, then injects the guest CSP meta + bootstrap.
 */
export function prepareHtmlPreviewDocument(html: string): string {
  const stripped = stripGuestCspAndBase(html);
  const inject = `<meta http-equiv="Content-Security-Policy" content="${HTML_PREVIEW_GUEST_CSP}"><script ${HTML_PREVIEW_BOOT_ATTR}>${HTML_PREVIEW_BOOTSTRAP_SOURCE}</script>`;
  const headOpen = /<head\b[^>]*>/i.exec(stripped);
  if (headOpen) {
    const at = headOpen.index + headOpen[0].length;
    return stripped.slice(0, at) + inject + stripped.slice(at);
  }
  const htmlOpen = /<html\b[^>]*>/i.exec(stripped);
  if (htmlOpen) {
    const at = htmlOpen.index + htmlOpen[0].length;
    return `${stripped.slice(0, at)}<head>${inject}</head>${stripped.slice(at)}`;
  }
  return `<!DOCTYPE html><html><head>${inject}</head><body>${stripped}</body></html>`;
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
 * Build the dialog's render plan. HTML plans render in an isolated-origin
 * iframe whose sandbox allows guest scripts but never same-origin or top
 * navigation. There is no field a caller can set to navigate the main
 * webview or load `/media/`.
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
  if (kind === "markdown") return "markdown";
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
