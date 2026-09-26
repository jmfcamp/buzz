//! File-backed Buzz browser Observe/Drive tools (grant-gated).
//! Desktop mirrors grants/events under `{BUZZ_BROWSER_AGENT_DIR|/app-data/browser-agent}`.

use rmcp::model::{CallToolResult, Content};
use rmcp::ErrorData;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

fn agent_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("BUZZ_BROWSER_AGENT_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    // macOS Hula default app support path when Desktop is running as this user.
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home)
        .join("Library/Application Support/com.huladesk.buzz/browser-agent")
}

fn caller_pubkey() -> Option<String> {
    // buzz-acp injects the agent secret; derive is heavy — prefer explicit pubkey env.
    for key in ["BUZZ_AGENT_PUBKEY", "BUZZ_ACP_PUBKEY"] {
        if let Ok(v) = std::env::var(key) {
            let t = v.trim().to_lowercase();
            if t.len() == 64 && t.chars().all(|c| c.is_ascii_hexdigit()) {
                return Some(t);
            }
        }
    }
    None
}

fn read_json(path: &Path) -> Option<Value> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn grant_matches(grant: &Value, pubkey: &str) -> bool {
    grant
        .get("agentPubkey")
        .and_then(|v| v.as_str())
        .map(|p| p.eq_ignore_ascii_case(pubkey))
        .unwrap_or(false)
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ObservePollParams {
    pub webview_label: String,
    #[serde(default)]
    pub after_id: Option<u64>,
    #[serde(default)]
    pub limit: Option<usize>,
}

pub fn observe_poll(p: ObservePollParams) -> Result<CallToolResult, ErrorData> {
    let Some(pubkey) = caller_pubkey() else {
        return Err(ErrorData::invalid_params(
            "BUZZ_AGENT_PUBKEY (64-hex) required for browser_observe_poll",
            None,
        ));
    };
    let label = p.webview_label.trim();
    if label.is_empty() {
        return Err(ErrorData::invalid_params("webview_label required", None));
    }
    let dir = agent_dir().join(label);
    let grant = read_json(&dir.join("grant.json")).ok_or_else(|| {
        ErrorData::invalid_params(format!("no grant for {label}"), None)
    })?;
    if !grant_matches(&grant, &pubkey) {
        return Err(ErrorData::invalid_params(
            "caller is not the granted agent for this webview",
            None,
        ));
    }
    let after = p.after_id.unwrap_or(0);
    let limit = p.limit.unwrap_or(50).clamp(1, 200);
    let path = dir.join("events.jsonl");
    let mut events = Vec::new();
    if let Ok(file) = fs::File::open(path) {
        for line in BufReader::new(file).lines().flatten() {
            if let Ok(ev) = serde_json::from_str::<Value>(&line) {
                let id = ev.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                if id > after {
                    events.push(ev);
                    if events.len() >= limit {
                        break;
                    }
                }
            }
        }
    }
    let body = json!({ "grant": grant, "events": events });
    Ok(CallToolResult::success(vec![Content::text(
        body.to_string(),
    )]))
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GrantsParams {}

pub fn grants(_p: GrantsParams) -> Result<CallToolResult, ErrorData> {
    let Some(pubkey) = caller_pubkey() else {
        return Err(ErrorData::invalid_params(
            "BUZZ_AGENT_PUBKEY required for browser_agent_grants",
            None,
        ));
    };
    let root = agent_dir();
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(root) {
        for entry in entries.flatten() {
            let grant_path = entry.path().join("grant.json");
            if let Some(grant) = read_json(&grant_path) {
                if grant_matches(&grant, &pubkey) {
                    out.push(grant);
                }
            }
        }
    }
    Ok(CallToolResult::success(vec![Content::text(
        json!({ "grants": out }).to_string(),
    )]))
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DriveParams {
    pub webview_label: String,
    pub action: Value,
}

pub fn drive(p: DriveParams) -> Result<CallToolResult, ErrorData> {
    let Some(pubkey) = caller_pubkey() else {
        return Err(ErrorData::invalid_params(
            "BUZZ_AGENT_PUBKEY required for browser_drive",
            None,
        ));
    };
    let label = p.webview_label.trim();
    if label.is_empty() {
        return Err(ErrorData::invalid_params("webview_label required", None));
    }
    let dir = agent_dir().join(label);
    let grant = read_json(&dir.join("grant.json")).ok_or_else(|| {
        ErrorData::invalid_params(format!("no grant for {label}"), None)
    })?;
    if !grant_matches(&grant, &pubkey) {
        return Err(ErrorData::invalid_params(
            "caller is not the granted agent for this webview",
            None,
        ));
    }
    let mode = grant
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or("observe");
    if mode != "drive" {
        return Err(ErrorData::invalid_params(
            "drive requires Drive mode grant",
            None,
        ));
    }
    fs::create_dir_all(&dir).map_err(|e| ErrorData::internal_error(e.to_string(), None))?;
    let path = dir.join("drive-inbox.jsonl");
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| ErrorData::internal_error(e.to_string(), None))?;
    let line = json!({
        "agentPubkey": pubkey,
        "action": p.action,
        "atMs": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    });
    writeln!(file, "{line}").map_err(|e| ErrorData::internal_error(e.to_string(), None))?;
    Ok(CallToolResult::success(vec![Content::text(
        json!({ "ok": true, "queued": true }).to_string(),
    )]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn observe_poll_respects_grant() {
        let dir = tempdir().unwrap();
        std::env::set_var("BUZZ_BROWSER_AGENT_DIR", dir.path());
        std::env::set_var(
            "BUZZ_AGENT_PUBKEY",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        );
        let label = "playground-demo";
        let gdir = dir.path().join(label);
        fs::create_dir_all(&gdir).unwrap();
        fs::write(
            gdir.join("grant.json"),
            r#"{"agentPubkey":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","mode":"observe","webviewLabel":"playground-demo"}"#,
        )
        .unwrap();
        let mut events = fs::File::create(gdir.join("events.jsonl")).unwrap();
        writeln!(
            events,
            r#"{{"id":1,"webviewLabel":"playground-demo","kind":"console","atMs":1}}"#
        )
        .unwrap();
        let result = observe_poll(ObservePollParams {
            webview_label: label.into(),
            after_id: Some(0),
            limit: Some(10),
        })
        .unwrap();
        let text = format!("{result:?}");
        assert!(text.contains("console"));
    }
}
