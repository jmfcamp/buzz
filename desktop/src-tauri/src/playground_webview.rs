//! Playground overlay webviews. Inspect targets `playground-{sid}` only.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::webview::WebviewBuilder;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, State, Url, WebviewUrl};
use uuid::Uuid;

const PLAYGROUND_LABEL_PREFIX: &str = "playground-";
const APP_WEBVIEW_LABEL: &str = "main";
const MIN_EDGE: f64 = 32.0;
const OPENCLAW_GATEWAY_PORT: u16 = 18789;
const BROWSER_DEBUG_PORTS: [u16; 5] = [9222, 9223, 9229, 9230, 5858];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaygroundBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaygroundProbeResult {
    up: bool,
    status: Option<u16>,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaygroundInspectResult {
    webview_id: String,
}

struct PlaygroundSession {
    url: Url,
}

#[derive(Default)]
pub struct PlaygroundWebviewManager {
    sessions: Mutex<HashMap<String, PlaygroundSession>>,
}

pub fn is_blocked_playground_port(port: u16) -> bool {
    port == OPENCLAW_GATEWAY_PORT || BROWSER_DEBUG_PORTS.contains(&port)
}

pub fn parse_playground_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|error| format!("invalid url: {error}"))?;
    if url.scheme() != "https" {
        return Err("playground URL must use https".into());
    }
    if url.host_str().is_none() {
        return Err("playground URL must include a host".into());
    }
    if let Some(port) = url.port() {
        if is_blocked_playground_port(port) {
            return Err("playground URL port is not allowed".into());
        }
    }
    Ok(url)
}

pub fn classify_probe_status(status: u16, content_type: Option<&str>, cf_access: bool) -> bool {
    if status == 502 || status == 530 {
        return false;
    }
    if (200..400).contains(&status) {
        return true;
    }
    if status == 401 || status == 403 {
        return cf_access || is_html_content_type(content_type);
    }
    false
}

fn is_html_content_type(content_type: Option<&str>) -> bool {
    content_type
        .unwrap_or("")
        .to_ascii_lowercase()
        .contains("text/html")
}

fn looks_like_cf_access(headers: &reqwest::header::HeaderMap, body: &str) -> bool {
    if headers
        .get("cf-mitigated")
        .and_then(|value| value.to_str().ok())
        .is_some()
    {
        return true;
    }
    if headers
        .get("location")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|location| location.contains("cloudflareaccess.com"))
    {
        return true;
    }
    let lower = body.to_ascii_lowercase();
    lower.contains("cloudflare access") || lower.contains("access pin")
}

fn sanitize_sid(sid: &str) -> Result<String, String> {
    if sid.is_empty() || sid.len() > 80 {
        return Err("invalid playground sid".into());
    }
    if !sid
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("invalid playground sid".into());
    }
    Ok(sid.to_string())
}

pub fn playground_label(sid: &str) -> String {
    format!("{PLAYGROUND_LABEL_PREFIX}{sid}")
}

pub fn inspect_target_is_safe(webview_id: &str) -> bool {
    webview_id.starts_with(PLAYGROUND_LABEL_PREFIX) && webview_id != APP_WEBVIEW_LABEL
}

fn bounds_are_usable(bounds: &PlaygroundBounds) -> bool {
    bounds.width >= MIN_EDGE && bounds.height >= MIN_EDGE
}

fn apply_bounds(app: &AppHandle, sid: &str, bounds: &PlaygroundBounds) -> Result<(), String> {
    let Some(webview) = app.get_webview(&playground_label(sid)) else {
        return Ok(());
    };
    webview
        .set_position(LogicalPosition::new(bounds.x, bounds.y))
        .map_err(|error| error.to_string())?;
    webview
        .set_size(LogicalSize::new(
            bounds.width.max(1.0),
            bounds.height.max(1.0),
        ))
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn hide_other_playgrounds(app: &AppHandle, keep_sid: &str) {
    let keep = playground_label(keep_sid);
    for webview in app.webviews().into_values() {
        let label = webview.label();
        if label.starts_with(PLAYGROUND_LABEL_PREFIX) && label != keep {
            let _ = webview.hide();
        }
    }
}

fn data_store_identifier(sid: &str) -> [u8; 16] {
    *Uuid::new_v5(
        &Uuid::NAMESPACE_URL,
        format!("buzz-playground:{sid}").as_bytes(),
    )
    .as_bytes()
}

#[tauri::command]
pub async fn playground_probe(url: String) -> Result<PlaygroundProbeResult, String> {
    let parsed = match parse_playground_url(&url) {
        Ok(value) => value,
        Err(message) => {
            return Ok(PlaygroundProbeResult {
                up: false,
                status: None,
                message: Some(message),
            });
        }
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|error| error.to_string())?;
    let response = match client.get(parsed).send().await {
        Ok(response) => response,
        Err(error) => {
            return Ok(PlaygroundProbeResult {
                up: false,
                status: None,
                message: Some(format!("connect failed: {error}")),
            });
        }
    };
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned);
    let headers = response.headers().clone();
    let body = response.text().await.unwrap_or_default();
    let prefix: String = body.chars().take(4000).collect();
    let cf_access = looks_like_cf_access(&headers, &prefix);
    let up = classify_probe_status(status, content_type.as_deref(), cf_access);
    Ok(PlaygroundProbeResult {
        up,
        status: Some(status),
        message: if up {
            None
        } else {
            Some(format!("playground returned {status}"))
        },
    })
}

#[tauri::command]
pub async fn playground_webview_show(
    app: AppHandle,
    manager: State<'_, PlaygroundWebviewManager>,
    sid: String,
    url: String,
    bounds: PlaygroundBounds,
) -> Result<(), String> {
    let sid = sanitize_sid(&sid)?;
    let url = parse_playground_url(&url)?;
    hide_other_playgrounds(&app, &sid);
    {
        let mut sessions = manager
            .sessions
            .lock()
            .map_err(|_| "playground session lock poisoned".to_string())?;
        sessions.insert(sid.clone(), PlaygroundSession { url: url.clone() });
    }

    let label = playground_label(&sid);
    if let Some(webview) = app.get_webview(&label) {
        apply_bounds(&app, &sid, &bounds)?;
        if webview.url().ok().as_ref() != Some(&url) {
            webview.navigate(url).map_err(|error| error.to_string())?;
        }
        webview.show().map_err(|error| error.to_string())?;
        return Ok(());
    }

    if !bounds_are_usable(&bounds) {
        return Ok(());
    }

    let window = app
        .get_window(APP_WEBVIEW_LABEL)
        .ok_or_else(|| "main window is not available".to_string())?;
    let profile_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("playground-profiles")
        .join(&sid);
    std::fs::create_dir_all(&profile_dir).map_err(|error| error.to_string())?;
    let builder = WebviewBuilder::new(label, WebviewUrl::External(url))
        .data_directory(profile_dir)
        .data_store_identifier(data_store_identifier(&sid))
        .devtools(true);

    window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)),
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn playground_webview_hide(app: AppHandle, sid: String) -> Result<(), String> {
    let sid = sanitize_sid(&sid)?;
    if let Some(webview) = app.get_webview(&playground_label(&sid)) {
        webview.hide().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn playground_webview_hide_all(app: AppHandle) -> Result<(), String> {
    for webview in app.webviews().into_values() {
        if webview.label().starts_with(PLAYGROUND_LABEL_PREFIX) {
            let _ = webview.hide();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn playground_webview_set_bounds(
    app: AppHandle,
    sid: String,
    bounds: PlaygroundBounds,
) -> Result<(), String> {
    let sid = sanitize_sid(&sid)?;
    apply_bounds(&app, &sid, &bounds)
}

#[tauri::command]
pub async fn playground_webview_close(
    app: AppHandle,
    manager: State<'_, PlaygroundWebviewManager>,
    sid: String,
) -> Result<(), String> {
    let sid = sanitize_sid(&sid)?;
    if let Some(webview) = app.get_webview(&playground_label(&sid)) {
        webview.close().map_err(|error| error.to_string())?;
    }
    if let Ok(mut sessions) = manager.sessions.lock() {
        sessions.remove(&sid);
    }
    Ok(())
}

#[tauri::command]
pub async fn playground_webview_close_all(
    app: AppHandle,
    manager: State<'_, PlaygroundWebviewManager>,
) -> Result<(), String> {
    for webview in app.webviews().into_values() {
        if webview.label().starts_with(PLAYGROUND_LABEL_PREFIX) {
            let _ = webview.close();
        }
    }
    if let Ok(mut sessions) = manager.sessions.lock() {
        sessions.clear();
    }
    Ok(())
}

#[tauri::command]
pub async fn playground_webview_inspect(
    app: AppHandle,
    sid: String,
) -> Result<PlaygroundInspectResult, String> {
    let sid = sanitize_sid(&sid)?;
    let webview_id = playground_label(&sid);
    if !inspect_target_is_safe(&webview_id) {
        return Err("inspect must target the playground webview".into());
    }
    let webview = app
        .get_webview(&webview_id)
        .ok_or_else(|| "playground webview is not open".to_string())?;
    #[cfg(any(debug_assertions, feature = "devtools"))]
    webview.open_devtools();
    let _ = app;
    let _ = webview;
    Ok(PlaygroundInspectResult { webview_id })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_http_and_debug_ports() {
        assert!(parse_playground_url("http://app.example.com").is_err());
        assert!(parse_playground_url("https://app.example.com:18789").is_err());
        assert!(parse_playground_url("https://app.example.com:9222").is_err());
        assert!(parse_playground_url("https://app.example.com:9229").is_err());
        assert!(parse_playground_url("https://app.example.com").is_ok());
    }

    #[test]
    fn probe_classifies_access_pin_up_and_bad_gateway_down() {
        assert!(classify_probe_status(200, Some("text/html"), false));
        assert!(classify_probe_status(302, Some("text/html"), false));
        assert!(classify_probe_status(403, Some("text/html"), true));
        assert!(classify_probe_status(403, Some("text/html"), false));
        assert!(!classify_probe_status(502, Some("text/html"), false));
        assert!(!classify_probe_status(530, Some("text/html"), false));
    }

    #[test]
    fn inspect_never_targets_the_app_webview() {
        assert!(inspect_target_is_safe("playground-abc"));
        assert!(!inspect_target_is_safe("main"));
        assert_ne!(playground_label("demo"), APP_WEBVIEW_LABEL);
    }
}
