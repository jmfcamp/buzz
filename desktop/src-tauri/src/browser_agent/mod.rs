//! Buzz in-app browser Observe/Drive grants (WKWebView playground/pin).
//! Not OpenClaw Chromium / CDP.

pub mod drive;
pub mod grant;
pub mod observe;

use std::fs::{create_dir_all, File};
use std::io::Write;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, State, Url};

use crate::playground_webview;
use drive::{DriveAction, DriveActionResult};
use grant::{
    now_ms, pin_label, playground_label, BrowserAgentGrant, BrowserAgentGrantStore,
    BrowserAgentMode, BrowserAgentSurface,
};
use observe::{
    drain_to_cookie_js, instrumentation_js, BrowserObserveBuffer, ObserveEvent, DRAIN_COOKIE,
};

#[derive(Default)]
pub struct BrowserAgentState {
    pub grants: BrowserAgentGrantStore,
    pub observe: BrowserObserveBuffer,
}

fn ensure_data_root(app: &AppHandle, state: &BrowserAgentState) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("browser-agent");
    create_dir_all(&root).map_err(|e| e.to_string())?;
    state.observe.set_root(root.clone());
    Ok(root)
}

fn mirror_grant(root: &PathBuf, grant: Option<&BrowserAgentGrant>, label: &str) {
    let dir = root.join(label);
    let _ = create_dir_all(&dir);
    let path = dir.join("grant.json");
    match grant {
        Some(g) => {
            if let Ok(bytes) = serde_json::to_vec_pretty(g) {
                if let Ok(mut f) = File::create(&path) {
                    let _ = f.write_all(&bytes);
                }
            }
        }
        None => {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn emit_grant(app: &AppHandle, grant: Option<&BrowserAgentGrant>, webview_label: &str) {
    let _ = app.emit(
        "browser-agent-grant",
        json!({
            "webviewLabel": webview_label,
            "grant": grant,
        }),
    );
}

fn resolve_label(
    surface: BrowserAgentSurface,
    surface_id: &str,
    window_label: Option<&str>,
) -> Result<String, String> {
    let window = window_label.unwrap_or("main").trim();
    let window = if window.is_empty() { "main" } else { window };
    match surface {
        BrowserAgentSurface::Playground => {
            let sid = sanitize_id(surface_id, "sid")?;
            Ok(playground_label(&sid, window))
        }
        BrowserAgentSurface::Pin => {
            let pin_id = sanitize_id(surface_id, "pinId")?;
            Ok(pin_label(&pin_id, window))
        }
    }
}

fn sanitize_id(raw: &str, kind: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(format!("{kind} is required"));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("{kind} has invalid characters"));
    }
    Ok(trimmed.to_string())
}

fn eval_on_label(app: &AppHandle, label: &str, js: &str) -> Result<(), String> {
    let webview = app
        .get_webview(label)
        .ok_or_else(|| format!("webview {label} is not open"))?;
    webview.eval(js).map_err(|e| e.to_string())
}

fn install_instrumentation(
    app: &AppHandle,
    label: &str,
    drive: bool,
) -> Result<(), String> {
    eval_on_label(app, label, &instrumentation_js(label, drive))
}

/// Clear grants when a playground/pin surface is disposed.
pub fn clear_grants_for_surface(app: &AppHandle, surface_id: &str) {
    let Some(state) = app.try_state::<BrowserAgentState>() else {
        return;
    };
    let removed = state.grants.clear_surface(surface_id);
    for grant in removed {
        state.observe.clear(&grant.webview_label);
        if let Ok(root) = ensure_data_root(app, &state) {
            mirror_grant(&root, None, &grant.webview_label);
        }
        emit_grant(app, None, &grant.webview_label);
    }
}

pub fn clear_grant_for_label(app: &AppHandle, webview_label: &str) {
    let Some(state) = app.try_state::<BrowserAgentState>() else {
        return;
    };
    if state.grants.clear(webview_label).is_some() {
        state.observe.clear(webview_label);
        if let Ok(root) = ensure_data_root(app, &state) {
            mirror_grant(&root, None, webview_label);
        }
        emit_grant(app, None, webview_label);
    }
}

pub fn record_nav_event(app: &AppHandle, webview_label: &str, url: &str, title: Option<&str>) {
    let Some(state) = app.try_state::<BrowserAgentState>() else {
        return;
    };
    if state.grants.get(webview_label).is_none() {
        return;
    }
    state.observe.push(
        webview_label,
        "nav",
        Some(json!({ "url": url, "title": title })),
        now_ms(),
    );
    let _ = app.emit(
        "browser-agent-observe",
        json!({ "webviewLabel": webview_label, "kind": "nav" }),
    );
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantSetInput {
    pub surface: BrowserAgentSurface,
    pub surface_id: String,
    pub agent_id: String,
    pub agent_pubkey: String,
    pub channel_id: String,
    pub thread_root: Option<String>,
    pub mode: BrowserAgentMode,
    pub allow_replace: Option<bool>,
    pub window_label: Option<String>,
}

#[tauri::command]
pub async fn browser_agent_grant_set(
    app: AppHandle,
    state: State<'_, BrowserAgentState>,
    input: GrantSetInput,
) -> Result<BrowserAgentGrant, String> {
    let label = resolve_label(input.surface, &input.surface_id, input.window_label.as_deref())?;
    if app.get_webview(&label).is_none() {
        return Err(format!("webview {label} is not open"));
    }
    let agent_pubkey = input.agent_pubkey.trim().to_string();
    if agent_pubkey.is_empty() {
        return Err("agentPubkey is required".into());
    }
    if input.channel_id.trim().is_empty() {
        return Err("channelId is required".into());
    }
    let grant = BrowserAgentGrant {
        webview_label: label.clone(),
        surface: input.surface,
        surface_id: sanitize_id(&input.surface_id, "surfaceId")?,
        agent_id: input.agent_id.trim().to_string(),
        agent_pubkey,
        channel_id: input.channel_id.trim().to_string(),
        thread_root: input
            .thread_root
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty()),
        mode: input.mode,
        created_at_ms: now_ms(),
    };
    state
        .grants
        .set(grant.clone(), input.allow_replace.unwrap_or(false))?;
    let root = ensure_data_root(&app, &state)?;
    mirror_grant(&root, Some(&grant), &label);
    let drive = matches!(grant.mode, BrowserAgentMode::Drive);
    install_instrumentation(&app, &label, drive)?;
    state.observe.push(
        &label,
        "grant",
        Some(json!({ "mode": grant.mode.as_str(), "agentPubkey": grant.agent_pubkey })),
        now_ms(),
    );
    emit_grant(&app, Some(&grant), &label);
    Ok(grant)
}

#[tauri::command]
pub async fn browser_agent_grant_clear(
    app: AppHandle,
    state: State<'_, BrowserAgentState>,
    webview_label: String,
) -> Result<(), String> {
    let label = webview_label.trim().to_string();
    let _ = state.grants.clear(&label);
    state.observe.clear(&label);
    // Best-effort unlock overlay if page still up.
    let _ = eval_on_label(
        &app,
        &label,
        "(function(){var a=window.__buzzBrowserAgent;if(a)a.setDrive(false);})();",
    );
    if let Ok(root) = ensure_data_root(&app, &state) {
        mirror_grant(&root, None, &label);
    }
    emit_grant(&app, None, &label);
    Ok(())
}

#[tauri::command]
pub async fn browser_agent_grant_get(
    state: State<'_, BrowserAgentState>,
    webview_label: String,
) -> Result<Option<BrowserAgentGrant>, String> {
    Ok(state.grants.get(webview_label.trim()))
}

#[tauri::command]
pub async fn browser_agent_grants_for_agent(
    state: State<'_, BrowserAgentState>,
    agent_pubkey: String,
) -> Result<Vec<BrowserAgentGrant>, String> {
    Ok(state.grants.list_for_agent(agent_pubkey.trim()))
}

#[tauri::command]
pub async fn browser_agent_take_control(
    app: AppHandle,
    state: State<'_, BrowserAgentState>,
    webview_label: String,
) -> Result<(), String> {
    // Product choice: Take control → Off (grant cleared).
    browser_agent_grant_clear(app, state, webview_label).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservePollInput {
    pub webview_label: String,
    pub agent_pubkey: String,
    pub after_id: Option<u64>,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObservePollResult {
    pub events: Vec<ObserveEvent>,
    pub grant: BrowserAgentGrant,
}

#[tauri::command]
pub async fn browser_observe_poll(
    app: AppHandle,
    state: State<'_, BrowserAgentState>,
    input: ObservePollInput,
) -> Result<ObservePollResult, String> {
    let label = input.webview_label.trim().to_string();
    let grant = state.grants.require_mode(
        &label,
        input.agent_pubkey.trim(),
        BrowserAgentMode::Observe,
    )?;
    // Pull any page-queued events via cookie drain.
    let after = input.after_id.unwrap_or(0);
    let limit = input.limit.unwrap_or(50);
    let _ = eval_on_label(&app, &label, &drain_to_cookie_js(after, limit));
    if let Some(webview) = app.get_webview(&label) {
        if let Ok(url) = webview.url() {
            let cookie_url = url.clone();
            if let Ok(Ok(cookies)) =
                tokio::task::spawn_blocking(move || webview.cookies_for_url(cookie_url)).await
            {
                if let Some(cookie) = cookies.iter().find(|c| c.name() == DRAIN_COOKIE) {
                    if let Ok(decoded) = urlencoding_decode(cookie.value()) {
                        if let Ok(page_events) =
                            serde_json::from_str::<Vec<PageDrainEvent>>(&decoded)
                        {
                            for pe in page_events {
                                state.observe.push(
                                    &label,
                                    &pe.kind,
                                    pe.payload,
                                    pe.at_ms.unwrap_or_else(now_ms),
                                );
                            }
                        }
                    }
                }
            }
        }
    }
    let events = state.observe.poll(&label, after, limit);
    Ok(ObservePollResult { events, grant })
}

#[derive(Debug, Deserialize)]
struct PageDrainEvent {
    #[serde(default)]
    id: u64,
    kind: String,
    #[serde(default, rename = "atMs")]
    at_ms: Option<u64>,
    #[serde(default)]
    payload: Option<serde_json::Value>,
}

fn urlencoding_decode(raw: &str) -> Result<String, ()> {
    // Minimal decode for cookie value; percent-decoding.
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let h = |c: u8| -> Option<u8> {
                    match c {
                        b'0'..=b'9' => Some(c - b'0'),
                        b'a'..=b'f' => Some(c - b'a' + 10),
                        b'A'..=b'F' => Some(c - b'A' + 10),
                        _ => None,
                    }
                };
                if let (Some(a), Some(b)) = (h(bytes[i + 1]), h(bytes[i + 2])) {
                    out.push((a << 4) | b);
                    i += 3;
                    continue;
                }
                out.push(bytes[i]);
                i += 1;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8(out).map_err(|_| ())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveInput {
    pub webview_label: String,
    pub agent_pubkey: String,
    pub action: DriveAction,
    pub window_label: Option<String>,
}

#[tauri::command]
pub async fn browser_drive(
    app: AppHandle,
    state: State<'_, BrowserAgentState>,
    input: DriveInput,
) -> Result<DriveActionResult, String> {
    let label = input.webview_label.trim().to_string();
    let grant = state.grants.require_mode(
        &label,
        input.agent_pubkey.trim(),
        BrowserAgentMode::Drive,
    )?;
    install_instrumentation(&app, &label, true)?;
    let kind = input.action.kind.trim().to_ascii_lowercase();
    if kind == "navigate" {
        let url = input
            .action
            .url
            .as_deref()
            .ok_or_else(|| "navigate requires url".to_string())?;
        match grant.surface {
            BrowserAgentSurface::Playground => {
                let parsed = playground_webview::parse_playground_url(url)?;
                let webview = app
                    .get_webview(&label)
                    .ok_or_else(|| "playground webview is not open".to_string())?;
                webview
                    .navigate(parsed)
                    .map_err(|e| e.to_string())?;
            }
            BrowserAgentSurface::Pin => {
                let parsed = Url::parse(url).map_err(|e| e.to_string())?;
                if parsed.scheme() != "https" {
                    return Err("pin navigate must use https".into());
                }
                let webview = app
                    .get_webview(&label)
                    .ok_or_else(|| "pin webview is not open".to_string())?;
                webview.navigate(parsed).map_err(|e| e.to_string())?;
            }
        }
        state.observe.push(
            &label,
            "drive",
            Some(json!({ "kind": "navigate", "url": url })),
            now_ms(),
        );
        return Ok(DriveActionResult {
            ok: true,
            message: Some("navigated".into()),
        });
    }
    let js = drive::action_js(&input.action)?;
    eval_on_label(&app, &label, &js)?;
    state.observe.push(
        &label,
        "drive",
        Some(json!({ "kind": kind })),
        now_ms(),
    );
    Ok(DriveActionResult {
        ok: true,
        message: None,
    })
}


#[tauri::command]
pub async fn browser_agent_process_drive_inbox(
    app: AppHandle,
    state: State<'_, BrowserAgentState>,
    webview_label: String,
) -> Result<u32, String> {
    let label = webview_label.trim().to_string();
    let Some(grant) = state.grants.get(&label) else {
        return Ok(0);
    };
    if !matches!(grant.mode, BrowserAgentMode::Drive) {
        return Ok(0);
    }
    let root = ensure_data_root(&app, &state)?;
    let path = root.join(&label).join("drive-inbox.jsonl");
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Ok(0);
    };
    let _ = std::fs::write(&path, "");
    let mut applied = 0u32;
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let Some(action_val) = value.get("action") else {
            continue;
        };
        let Ok(action) = serde_json::from_value::<DriveAction>(action_val.clone()) else {
            continue;
        };
        let agent_pubkey = value
            .get("agentPubkey")
            .and_then(|v| v.as_str())
            .unwrap_or(grant.agent_pubkey.as_str())
            .to_string();
        if agent_pubkey != grant.agent_pubkey {
            continue;
        }
        let _ = state.grants.require_mode(&label, &agent_pubkey, BrowserAgentMode::Drive)?;
        install_instrumentation(&app, &label, true)?;
        let kind = action.kind.trim().to_ascii_lowercase();
        if kind == "navigate" {
            if let Some(url) = action.url.as_deref() {
                match grant.surface {
                    BrowserAgentSurface::Playground => {
                        let parsed = playground_webview::parse_playground_url(url)?;
                        if let Some(webview) = app.get_webview(&label) {
                            webview.navigate(parsed).map_err(|e| e.to_string())?;
                        }
                    }
                    BrowserAgentSurface::Pin => {
                        let parsed = Url::parse(url).map_err(|e| e.to_string())?;
                        if let Some(webview) = app.get_webview(&label) {
                            webview.navigate(parsed).map_err(|e| e.to_string())?;
                        }
                    }
                }
            }
        } else if let Ok(js) = drive::action_js(&action) {
            let _ = eval_on_label(&app, &label, &js);
        }
        applied += 1;
    }
    Ok(applied)
}
