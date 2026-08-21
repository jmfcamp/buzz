//! Isolated-origin HTML attachment preview.
//!
//! Guest HTML is registered from fetched bytes and served on `html-preview://`
//! with its own CSP. That origin is not the Hula Buzz app shell, so parent
//! `script-src` (no `'unsafe-inline'`) cannot kill guest scripts the way a
//! `srcdoc` frame would. The iframe sandbox still forbids same-origin and
//! top-navigation; this handler never serves relay `/media/` bytes.

use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use tauri::{http, Manager};
use uuid::Uuid;

/// Must stay in lockstep with `HTML_PREVIEW_GUEST_CSP` in
/// `desktop/src/shared/ui/filePreview.ts` and the 10 MiB preview cap.
pub const HTML_PREVIEW_GUEST_CSP: &str = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob: data:; style-src 'unsafe-inline' data:; img-src data: blob: https: http:; font-src data: blob: https: http:; media-src data: blob: https: http:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'";

const MAX_PREVIEW_BYTES: usize = 10 * 1024 * 1024;
const MAX_STORED_PREVIEWS: usize = 8;

const OTHER_FILE_PAGE: &str = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Unavailable</title></head><body style=\"font:14px/1.4 system-ui,sans-serif;padding:16px;color:#222\"><p>This preview is a single file, so links to other files cannot be opened here.</p></body></html>";

#[derive(Default)]
pub struct HtmlPreviewStore {
    inner: Mutex<StoreInner>,
}

#[derive(Default)]
struct StoreInner {
    docs: HashMap<String, String>,
    order: VecDeque<String>,
}

impl HtmlPreviewStore {
    pub fn insert(&self, html: String) -> Result<String, String> {
        if html.len() > MAX_PREVIEW_BYTES {
            return Err("html preview too large".to_string());
        }
        let id = Uuid::new_v4().to_string();
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "html preview store lock poisoned".to_string())?;
        while inner.order.len() >= MAX_STORED_PREVIEWS {
            if let Some(old) = inner.order.pop_front() {
                inner.docs.remove(&old);
            }
        }
        inner.docs.insert(id.clone(), html);
        inner.order.push_back(id.clone());
        Ok(id)
    }

    pub fn get(&self, id: &str) -> Result<Option<String>, String> {
        let inner = self
            .inner
            .lock()
            .map_err(|_| "html preview store lock poisoned".to_string())?;
        Ok(inner.docs.get(id).cloned())
    }

    pub fn remove(&self, id: &str) -> Result<(), String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "html preview store lock poisoned".to_string())?;
        inner.docs.remove(id);
        inner.order.retain(|stored| stored != id);
        Ok(())
    }
}

/// Store rewritten guest HTML and return the unguessable preview id.
#[tauri::command]
pub fn register_html_preview(
    html: String,
    store: tauri::State<'_, HtmlPreviewStore>,
) -> Result<String, String> {
    store.insert(html)
}

/// Drop a preview document when the dialog unmounts.
#[tauri::command]
pub fn revoke_html_preview(
    id: String,
    store: tauri::State<'_, HtmlPreviewStore>,
) -> Result<(), String> {
    store.remove(&id)
}

pub fn handle_html_preview(
    app: &tauri::AppHandle,
    request: &http::Request<Vec<u8>>,
) -> http::Response<Vec<u8>> {
    let path = request.uri().path();
    let Some(id) = parse_preview_id(path) else {
        return html_response(404, "not found");
    };
    if has_extra_path(path) {
        return html_page(200, OTHER_FILE_PAGE);
    }
    let store = app.state::<HtmlPreviewStore>();
    match store.get(id) {
        Ok(Some(html)) => html_page(200, &html),
        Ok(None) => html_response(404, "not found"),
        Err(_) => html_response(500, "preview store unavailable"),
    }
}

fn parse_preview_id(path: &str) -> Option<&str> {
    let trimmed = path.trim_start_matches('/');
    let id = trimmed.split('/').next().filter(|part| !part.is_empty())?;
    Uuid::parse_str(id).ok()?;
    Some(id)
}

fn has_extra_path(path: &str) -> bool {
    let trimmed = path.trim_start_matches('/');
    let mut parts = trimmed.split('/');
    let _id = parts.next();
    parts.any(|part| !part.is_empty())
}

fn html_page(status: u16, body: &str) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header("content-type", "text/html; charset=utf-8")
        .header("content-security-policy", HTML_PREVIEW_GUEST_CSP)
        .header("cache-control", "no-store")
        .header("x-content-type-options", "nosniff")
        .body(body.as_bytes().to_vec())
        .unwrap_or_else(|_| html_response(500, "response build failed"))
}

fn html_response(status: u16, msg: &str) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header("content-type", "text/plain; charset=utf-8")
        .body(msg.as_bytes().to_vec())
        .unwrap_or_else(|_| {
            let mut response = http::Response::new(Vec::new());
            *response.status_mut() = http::StatusCode::INTERNAL_SERVER_ERROR;
            response
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guest_csp_allows_inline_scripts_and_not_parent_escape() {
        assert!(HTML_PREVIEW_GUEST_CSP.contains("script-src 'unsafe-inline'"));
        assert!(HTML_PREVIEW_GUEST_CSP.contains("connect-src 'none'"));
        assert!(HTML_PREVIEW_GUEST_CSP.contains("frame-src 'none'"));
        assert!(!HTML_PREVIEW_GUEST_CSP.contains("allow-same-origin"));
        let frontend = include_str!("../../src/shared/ui/filePreview.ts");
        assert!(
            frontend.contains(HTML_PREVIEW_GUEST_CSP),
            "Rust HTML_PREVIEW_GUEST_CSP must match filePreview.ts"
        );
    }

    #[test]
    fn parse_preview_id_accepts_uuid_paths_only() {
        let id = "550e8400-e29b-41d4-a716-446655440000";
        assert_eq!(parse_preview_id(&format!("/{id}")), Some(id));
        assert_eq!(parse_preview_id(&format!("/{id}/")), Some(id));
        assert_eq!(parse_preview_id(&format!("/{id}/other.html")), Some(id));
        assert_eq!(parse_preview_id("/media/abc.html"), None);
        assert_eq!(parse_preview_id("/not-a-uuid"), None);
        assert_eq!(parse_preview_id("/"), None);
    }

    #[test]
    fn extra_path_is_a_second_file() {
        let id = "550e8400-e29b-41d4-a716-446655440000";
        assert!(!has_extra_path(&format!("/{id}")));
        assert!(!has_extra_path(&format!("/{id}/")));
        assert!(has_extra_path(&format!("/{id}/other.html")));
    }

    #[test]
    fn html_page_sets_guest_csp_header() {
        let response = html_page(200, "<h1>Hi</h1>");
        let csp = response
            .headers()
            .get("content-security-policy")
            .expect("csp header");
        assert_eq!(csp.to_str().expect("csp is ascii"), HTML_PREVIEW_GUEST_CSP);
        assert_eq!(
            response
                .headers()
                .get("content-type")
                .expect("content-type")
                .to_str()
                .expect("content-type is ascii"),
            "text/html; charset=utf-8"
        );
    }

    #[test]
    fn store_round_trip_and_cap() {
        let store = HtmlPreviewStore::default();
        let id = store.insert("<h1>Hi</h1>".to_string()).expect("insert");
        assert_eq!(
            store.get(&id).expect("get"),
            Some("<h1>Hi</h1>".to_string())
        );
        store.remove(&id).expect("remove");
        assert_eq!(store.get(&id).expect("get after remove"), None);
        assert!(store.insert("x".repeat(MAX_PREVIEW_BYTES + 1)).is_err());
    }

    #[test]
    fn store_evicts_oldest_when_full() {
        let store = HtmlPreviewStore::default();
        let mut ids = Vec::new();
        for i in 0..(MAX_STORED_PREVIEWS + 2) {
            ids.push(store.insert(format!("doc-{i}")).expect("insert within cap"));
        }
        assert_eq!(store.get(&ids[0]).expect("get evicted"), None);
        assert_eq!(
            store.get(ids.last().expect("last")).expect("get newest"),
            Some(format!("doc-{}", MAX_STORED_PREVIEWS + 1))
        );
    }
}
