//! Ensure herdr session servers and (optionally) create workspaces for Buzz Term.
//!
//! The visible herdr TUI always runs inside Hula Buzz's in-app Buzz Term PTY
//! (`herdr session attach <name>`). This module never opens Terminal.app or
//! other external TTY clients.
//!
//! Plain Buzz Term open: return attach argv immediately (best-effort background
//! ensure). The in-app attach client starts/connects to the session server.
//! Term-session card Open: blocking ensure + `workspace create` (+ send-text).

use serde::Deserialize;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HerdrOpenRequest {
    cwd: Option<String>,
    command: Option<String>,
    label: Option<String>,
    #[serde(default)]
    env: Option<std::collections::HashMap<String, String>>,
    /// Named herdr session. Blank / missing → herdr unnamed default session.
    #[serde(default)]
    session_name: Option<String>,
    /// When true (term-session card Open only), create a focused workspace and
    /// optionally send `command` into its root pane. Plain Buzz Term open must
    /// pass false / omit so attach reuses the last focused workspace.
    #[serde(default)]
    create_workspace: bool,
}

fn herdr_bin() -> Option<PathBuf> {
    // Prefer PATH resolution so user installs (~/.local/bin) win.
    which_herdr().or_else(|| {
        let home = dirs::home_dir()?;
        let candidate = home.join(".local/bin/herdr");
        candidate.is_file().then_some(candidate)
    })
}

fn which_herdr() -> Option<PathBuf> {
    let output = Command::new("which").arg("herdr").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return None;
    }
    let pb = PathBuf::from(&path);
    pb.is_file().then_some(pb)
}

fn run_herdr(bin: &PathBuf, args: &[&str]) -> Result<String, String> {
    let output = Command::new(bin)
        .args(args)
        .output()
        .map_err(|e| format!("failed to run herdr: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "herdr {} failed: {}",
            args.join(" "),
            if !stderr.trim().is_empty() {
                stderr.trim()
            } else {
                stdout.trim()
            }
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Prefix CLI args with `--session <name>` when a named session is configured.
fn with_session<'a>(session: Option<&'a str>, args: &[&'a str]) -> Vec<&'a str> {
    match session {
        Some(name) if !name.is_empty() => {
            let mut out = Vec::with_capacity(args.len() + 2);
            out.push("--session");
            out.push(name);
            out.extend_from_slice(args);
            out
        }
        _ => args.to_vec(),
    }
}

fn session_server_running(bin: &PathBuf, session: Option<&str>) -> bool {
    let args = with_session(session, &["status"]);
    let Ok(stdout) = run_herdr(bin, &args) else {
        return false;
    };
    // `herdr status` exits 0 even when the server is down; parse the stanza.
    let mut in_server = false;
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("server:") {
            in_server = true;
            continue;
        }
        if in_server && trimmed.starts_with("status:") {
            return trimmed["status:".len()..].trim() == "running";
        }
        if in_server && !trimmed.is_empty() && !line.starts_with(' ') && !line.starts_with('\t')
        {
            break;
        }
    }
    false
}

/// Ensure the named herdr session exists and its server is running.
///
/// Programmatic stand-in for `herdr session attach <name>`: start the session
/// server headlessly (`herdr --session <name> server`) when needed.
/// Does not create a workspace — plain open attaches only; card Open creates.
fn ensure_herdr_session(bin: &PathBuf, session: Option<&str>) -> Result<(), String> {
    if session_server_running(bin, session) {
        return Ok(());
    }

    // Headless create/start (programmatic stand-in for `herdr session attach`).
    let mut cmd = Command::new(bin);
    match session {
        Some(name) if !name.is_empty() => {
            cmd.args(["--session", name, "server"]);
        }
        _ => {
            cmd.arg("server");
        }
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                libc::setsid();
                Ok(())
            });
        }
    }
    let label = session.unwrap_or("default");
    cmd.spawn()
        .map_err(|e| format!("failed to start herdr session `{label}`: {e}"))?;

    let deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < deadline {
        if session_server_running(bin, session) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    Err(format!(
        "herdr session `{label}` did not become ready; run `herdr session attach {label}`"
    ))
}

/// Argv for an in-app PTY that attaches the herdr TUI client.
fn attach_argv(session: Option<&str>) -> Vec<String> {
    match session {
        Some(name) if !name.is_empty() => {
            vec![
                "session".to_string(),
                "attach".to_string(),
                name.to_string(),
            ]
        }
        _ => Vec::new(),
    }
}

fn ok_payload(
    bin: &PathBuf,
    session: Option<&str>,
    workspace: Option<(String, String, String)>,
) -> serde_json::Value {
    let session_name = session.unwrap_or("").to_string();
    let mut value = serde_json::json!({
        "ok": true,
        "herdrBin": bin.to_string_lossy(),
        "sessionName": session_name,
        "attachArgv": attach_argv(session),
    });
    if let Some((workspace_id, tab_id, pane_id)) = workspace {
        value["workspaceId"] = serde_json::json!(workspace_id);
        value["tabId"] = serde_json::json!(tab_id);
        value["paneId"] = serde_json::json!(pane_id);
    }
    value
}

/// True when `herdr` is on PATH (or ~/.local/bin) and responds to `status`.
#[tauri::command]
pub fn term_herdr_available() -> bool {
    let Some(bin) = herdr_bin() else {
        return false;
    };
    // Binary present + CLI works. Server may be started on demand by open.
    run_herdr(&bin, &["status"]).is_ok()
}

/// Ensure the herdr session server; optionally create a focused workspace.
///
/// Never opens Terminal.app / an external TTY. Callers open an in-app Buzz Term
/// PTY with `herdrBin` + `attachArgv` (or reuse an existing attach tab).
#[tauri::command]
pub fn term_open_in_herdr(request: HerdrOpenRequest) -> Result<serde_json::Value, String> {
    let Some(bin) = herdr_bin() else {
        return Ok(serde_json::json!({
            "ok": false,
            "reason": "herdr is not installed"
        }));
    };

    let session_owned = request
        .session_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let session = session_owned.as_deref();

    if !request.create_workspace {
        // Plain open: return attach argv immediately so the in-app PTY can spawn
        // `herdr session attach` without waiting on a headless server ensure.
        // The attach client starts/connects to the session server itself.
        // Best-effort ensure in the background so a cold session is warm sooner.
        let bin_bg = bin.clone();
        let session_bg = session_owned.clone();
        std::thread::spawn(move || {
            let _ = ensure_herdr_session(&bin_bg, session_bg.as_deref());
        });
        return Ok(ok_payload(&bin, session, None));
    }

    if let Err(reason) = ensure_herdr_session(&bin, session) {
        return Ok(serde_json::json!({
            "ok": false,
            "reason": reason
        }));
    }

    let mut args: Vec<String> = Vec::new();
    if let Some(name) = session {
        args.push("--session".into());
        args.push(name.to_string());
    }
    args.push("workspace".into());
    args.push("create".into());
    args.push("--focus".into());
    if let Some(cwd) = request.cwd.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        args.push("--cwd".into());
        args.push(cwd.to_string());
    }
    if let Some(label) = request
        .label
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        args.push("--label".into());
        args.push(label.to_string());
    }
    if let Some(env) = request.env.as_ref() {
        for (key, value) in env {
            if key.is_empty() || key.contains('=') {
                continue;
            }
            args.push("--env".into());
            args.push(format!("{key}={value}"));
        }
    }

    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let stdout = match run_herdr(&bin, &arg_refs) {
        Ok(s) => s,
        Err(reason) => {
            return Ok(serde_json::json!({ "ok": false, "reason": reason }));
        }
    };

    let parsed: serde_json::Value = serde_json::from_str(stdout.trim()).map_err(|e| {
        format!("herdr workspace create returned non-JSON: {e}; raw={}", stdout.trim())
    })?;
    let workspace_id = parsed
        .pointer("/result/workspace/workspace_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let tab_id = parsed
        .pointer("/result/tab/tab_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let pane_id = parsed
        .pointer("/result/root_pane/pane_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if workspace_id.is_empty() || tab_id.is_empty() || pane_id.is_empty() {
        return Ok(serde_json::json!({
            "ok": false,
            "reason": format!("herdr workspace create missing ids: {stdout}")
        }));
    }

    if let Some(command) = request
        .command
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        // pane run replaces the shell with the command; for a shell line with
        // cd/exports, send-text + Enter is safer.
        let mut send_args: Vec<&str> = Vec::new();
        if let Some(name) = session {
            send_args.push("--session");
            send_args.push(name);
        }
        let cmd_line = format!("{command}\n");
        send_args.extend_from_slice(&["pane", "send-text", &pane_id, &cmd_line]);
        let _ = run_herdr(&bin, &send_args);
    }

    Ok(ok_payload(
        &bin,
        session,
        Some((workspace_id, tab_id, pane_id)),
    ))
}
