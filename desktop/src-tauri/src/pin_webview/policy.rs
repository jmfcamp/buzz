//! Pure navigation and load-recovery rules for pin webviews.
//!
//! These helpers are unit-tested without a WKWebView: reuse must recover from
//! a dead first load, a blank document, a changed start URL, or 1×1 bounds.

use serde::{Deserialize, Serialize};
use url::Url;

/// Minimum logical edge before a child webview is created or kept.
/// A 1×1 first layout must not become the permanent page.
pub const MIN_PIN_WEBVIEW_EDGE: f64 = 32.0;

pub const PIN_WEBVIEW_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
    AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PinLoadVerdict {
    Ok,
    Failed {
        message: String,
        status: Option<u16>,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentProbe {
    pub url: String,
    pub title: String,
    pub text_len: u64,
    pub html_len: u64,
    pub child_count: u64,
}

pub fn parse_optional_url(raw: Option<&str>) -> Option<Url> {
    let raw = raw?.trim();
    if raw.is_empty() {
        return None;
    }
    Url::parse(raw).ok()
}

pub fn is_unusable_document_url(url: Option<&Url>) -> bool {
    let Some(url) = url else {
        return true;
    };
    if url.as_str().trim().is_empty() {
        return true;
    }
    matches!(url.scheme(), "about" | "data")
}

pub fn same_https_origin(left: &Url, right: &Url) -> bool {
    left.origin() == right.origin()
}

/// Reuse an existing `pin-{id}` webview only when it already shows a live
/// document on this pin's start origin. Otherwise navigate to `start_url`.
pub fn should_navigate_existing(
    current: Option<&Url>,
    start_url: &Url,
    previous_start: Option<&Url>,
    last_load_failed: bool,
) -> bool {
    if last_load_failed {
        return true;
    }
    if is_unusable_document_url(current) {
        return true;
    }
    if previous_start.is_some_and(|previous| previous != start_url) {
        return true;
    }
    match current {
        Some(url) => !same_https_origin(url, start_url),
        None => true,
    }
}

pub fn bounds_are_usable(width: f64, height: f64) -> bool {
    width >= MIN_PIN_WEBVIEW_EDGE && height >= MIN_PIN_WEBVIEW_EDGE
}

pub fn should_recreate_tiny_webview(created_tiny: bool, width: f64, height: f64) -> bool {
    created_tiny && bounds_are_usable(width, height)
}

pub fn document_looks_empty(probe: &DocumentProbe) -> bool {
    if parse_optional_url(Some(&probe.url)).is_none_or(|url| is_unusable_document_url(Some(&url))) {
        return true;
    }
    probe.text_len == 0
        && probe.child_count == 0
        && probe.html_len < 200
        && probe.title.trim().is_empty()
}

pub fn classify_pin_load(
    current_url: Option<&Url>,
    document: Option<&DocumentProbe>,
    http_status: Option<u16>,
) -> PinLoadVerdict {
    if is_unusable_document_url(current_url) {
        return failed("The page did not load.", http_status);
    }
    if let Some(probe) = document {
        if document_looks_empty(probe) {
            return failed_status_or(http_status, "This page did not load any content.");
        }
        // A real document — login or error HTML — must stay visible.
        return PinLoadVerdict::Ok;
    }
    if let Some(status) = http_status {
        if status >= 400 {
            return failed_status_or(Some(status), "This page failed to load.");
        }
    }
    PinLoadVerdict::Ok
}

pub fn parse_document_probe(raw: &str) -> Option<DocumentProbe> {
    if let Ok(probe) = serde_json::from_str::<DocumentProbe>(raw) {
        return Some(probe);
    }
    let inner = serde_json::from_str::<String>(raw).ok()?;
    serde_json::from_str(&inner).ok()
}

pub fn http_failure_message(status: u16) -> String {
    format!("This site returned HTTP {status}.")
}

fn failed(message: &str, status: Option<u16>) -> PinLoadVerdict {
    PinLoadVerdict::Failed {
        message: match status {
            Some(code) if code >= 400 => http_failure_message(code),
            _ => message.to_string(),
        },
        status,
    }
}

fn failed_status_or(status: Option<u16>, fallback: &str) -> PinLoadVerdict {
    failed(fallback, status)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(raw: &str) -> Url {
        Url::parse(raw).expect("url")
    }

    #[test]
    fn reuse_navigates_when_current_url_is_blank_or_about_blank() {
        let start = url("https://wayfinder.huladesk.com/");
        assert!(should_navigate_existing(None, &start, Some(&start), false));
        assert!(should_navigate_existing(
            Some(&url("about:blank")),
            &start,
            Some(&start),
            false,
        ));
        assert!(should_navigate_existing(
            parse_optional_url(Some("")).as_ref(),
            &start,
            Some(&start),
            false,
        ));
    }

    #[test]
    fn reuse_navigates_when_origin_is_wrong() {
        let start = url("https://wayfinder.huladesk.com/");
        assert!(should_navigate_existing(
            Some(&url("https://example.com/")),
            &start,
            Some(&start),
            false,
        ));
    }

    #[test]
    fn reuse_navigates_when_start_url_changed() {
        let previous = url("https://wayfinder.huladesk.com/");
        let next = url("https://wayfinder.huladesk.com/app");
        assert!(should_navigate_existing(
            Some(&previous),
            &next,
            Some(&previous),
            false,
        ));
    }

    #[test]
    fn dead_first_load_then_show_navigates_again() {
        let start = url("https://wayfinder.huladesk.com/");
        assert!(should_navigate_existing(
            Some(&start),
            &start,
            Some(&start),
            true,
        ));
    }

    #[test]
    fn reuse_keeps_in_origin_history_when_healthy() {
        let start = url("https://wayfinder.huladesk.com/");
        let current = url("https://wayfinder.huladesk.com/path");
        assert!(!should_navigate_existing(
            Some(&current),
            &start,
            Some(&start),
            false,
        ));
    }

    #[test]
    fn tiny_first_bounds_are_not_usable_and_recreate_when_grown() {
        assert!(!bounds_are_usable(1.0, 1.0));
        assert!(!bounds_are_usable(16.0, 400.0));
        assert!(bounds_are_usable(320.0, 240.0));
        assert!(!should_recreate_tiny_webview(false, 320.0, 240.0));
        assert!(!should_recreate_tiny_webview(true, 1.0, 1.0));
        assert!(should_recreate_tiny_webview(true, 400.0, 300.0));
    }

    #[test]
    fn empty_document_or_http_error_is_a_visible_failure() {
        let start = url("https://wayfinder.huladesk.com/");
        let empty = DocumentProbe {
            url: start.to_string(),
            title: String::new(),
            text_len: 0,
            html_len: 80,
            child_count: 0,
        };
        assert!(document_looks_empty(&empty));
        assert_eq!(
            classify_pin_load(Some(&start), Some(&empty), Some(401)),
            PinLoadVerdict::Failed {
                message: "This site returned HTTP 401.".into(),
                status: Some(401),
            }
        );
        assert_eq!(
            classify_pin_load(Some(&url("about:blank")), None, None),
            PinLoadVerdict::Failed {
                message: "The page did not load.".into(),
                status: None,
            }
        );
    }

    #[test]
    fn login_html_is_not_treated_as_a_blank_failure() {
        let start = url("https://wayfinder.huladesk.com/");
        let login = DocumentProbe {
            url: start.to_string(),
            title: "Sign in".into(),
            text_len: 40,
            html_len: 1200,
            child_count: 3,
        };
        assert!(!document_looks_empty(&login));
        assert_eq!(
            classify_pin_load(Some(&start), Some(&login), Some(401)),
            PinLoadVerdict::Ok
        );
    }

    #[test]
    fn parse_document_probe_accepts_object_or_stringified_json() {
        let raw = r#"{"url":"https://wayfinder.huladesk.com/","title":"","textLen":0,"htmlLen":12,"childCount":0}"#;
        let probe = parse_document_probe(raw).expect("probe");
        assert_eq!(probe.child_count, 0);
        let wrapped = serde_json::to_string(raw).expect("wrap");
        assert_eq!(parse_document_probe(&wrapped).expect("nested").html_len, 12);
    }
}
