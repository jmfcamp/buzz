//! Build a Buzz Term `term-session` fenced card for chat handoff.
//!
//! Agents call this instead of inventing fence JSON by hand. The full handoff
//! prompt stays in JSON `prompt` (UI hides it). Chat reply should be a short
//! ack plus this tool’s returned fence only.

use rmcp::ErrorData;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const HULA: &str = "term-session";
const VERSION: u32 = 1;

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TermSessionCardParams {
    /// Short title for the card / tab.
    pub name: String,
    /// Interactive harness: `claude` or `codex`.
    pub tool: String,
    /// Full handoff prompt text (never dump as plain markdown in chat).
    pub prompt: String,
    /// Optional working directory (absolute or `~` path).
    #[serde(default)]
    pub cwd: Option<String>,
    /// Optional one-line summary for the card UI.
    #[serde(default)]
    pub summary: Option<String>,
    /// Session id (uuid). Generated when omitted or empty.
    #[serde(default)]
    pub sid: Option<String>,
    /// `true` only when the agent uses OpenClaw workspace. Boolean only —
    /// never put tokens/JWTs in the card.
    #[serde(default)]
    pub openclaw_workspace: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TermSessionCardPayload {
    hula: &'static str,
    v: u32,
    name: String,
    tool: String,
    sid: String,
    prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    openclaw_workspace: Option<bool>,
}

/// Validate params and return the exact markdown fence agents must paste.
pub fn run(p: TermSessionCardParams) -> Result<String, ErrorData> {
    let name = p.name.trim();
    if name.is_empty() {
        return Err(ErrorData::invalid_params("name must be non-empty", None));
    }

    let tool = p.tool.trim();
    if tool != "claude" && tool != "codex" {
        return Err(ErrorData::invalid_params(
            "tool must be \"claude\" or \"codex\"",
            None,
        ));
    }

    if p.prompt.is_empty() {
        return Err(ErrorData::invalid_params(
            "prompt must be non-empty",
            None,
        ));
    }

    let sid = match p.sid.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(existing) => existing.to_owned(),
        None => Uuid::new_v4().to_string(),
    };

    let cwd = p
        .cwd
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned);
    let summary = p
        .summary
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned);
    let openclaw_workspace = match p.openclaw_workspace {
        Some(true) => Some(true),
        _ => None,
    };

    let payload = TermSessionCardPayload {
        hula: HULA,
        v: VERSION,
        name: name.to_owned(),
        tool: tool.to_owned(),
        sid,
        prompt: p.prompt,
        cwd,
        summary,
        openclaw_workspace,
    };

    let body = serde_json::to_string(&payload).map_err(|e| {
        ErrorData::internal_error(format!("failed to serialize term-session card: {e}"), None)
    })?;

    Ok(format!("```term-session\n{body}\n```"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn base() -> TermSessionCardParams {
        TermSessionCardParams {
            name: "Thread handoff".into(),
            tool: "claude".into(),
            prompt: "Do the thing".into(),
            cwd: None,
            summary: None,
            sid: None,
            openclaw_workspace: None,
        }
    }

    fn parse_fence(out: &str) -> Value {
        assert!(
            out.starts_with("```term-session\n"),
            "missing fence open: {out}"
        );
        assert!(out.ends_with("\n```"), "missing fence close: {out}");
        let json = out
            .strip_prefix("```term-session\n")
            .unwrap()
            .strip_suffix("\n```")
            .unwrap();
        serde_json::from_str(json).expect("card json")
    }

    #[test]
    fn builds_fence_with_generated_sid() {
        let out = run(base()).unwrap();
        let v = parse_fence(&out);
        assert_eq!(v["hula"], "term-session");
        assert_eq!(v["v"], 1);
        assert_eq!(v["name"], "Thread handoff");
        assert_eq!(v["tool"], "claude");
        assert_eq!(v["prompt"], "Do the thing");
        let sid = v["sid"].as_str().unwrap();
        assert!(Uuid::parse_str(sid).is_ok(), "sid={sid}");
        assert!(v.get("cwd").is_none());
        assert!(v.get("summary").is_none());
        assert!(v.get("openclawWorkspace").is_none());
    }

    #[test]
    fn preserves_sid_and_optionals() {
        let mut p = base();
        p.tool = "codex".into();
        p.sid = Some("11111111-1111-1111-1111-111111111111".into());
        p.cwd = Some("~/src".into());
        p.summary = Some("ship it".into());
        p.openclaw_workspace = Some(true);
        let v = parse_fence(&run(p).unwrap());
        assert_eq!(v["tool"], "codex");
        assert_eq!(v["sid"], "11111111-1111-1111-1111-111111111111");
        assert_eq!(v["cwd"], "~/src");
        assert_eq!(v["summary"], "ship it");
        assert_eq!(v["openclawWorkspace"], true);
    }

    #[test]
    fn openclaw_false_omitted() {
        let mut p = base();
        p.openclaw_workspace = Some(false);
        let v = parse_fence(&run(p).unwrap());
        assert!(v.get("openclawWorkspace").is_none());
    }

    #[test]
    fn rejects_empty_name() {
        let mut p = base();
        p.name = "   ".into();
        let err = run(p).unwrap_err();
        assert!(err.message.contains("name"), "got: {}", err.message);
    }

    #[test]
    fn rejects_empty_prompt() {
        let mut p = base();
        p.prompt = String::new();
        let err = run(p).unwrap_err();
        assert!(err.message.contains("prompt"), "got: {}", err.message);
    }

    #[test]
    fn rejects_bad_tool() {
        let mut p = base();
        p.tool = "gemini".into();
        let err = run(p).unwrap_err();
        assert!(err.message.contains("tool"), "got: {}", err.message);
    }

    #[test]
    fn empty_sid_generates() {
        let mut p = base();
        p.sid = Some("  ".into());
        let v = parse_fence(&run(p).unwrap());
        assert!(Uuid::parse_str(v["sid"].as_str().unwrap()).is_ok());
    }

    #[test]
    fn params_accept_camel_case_openclaw() {
        let p: TermSessionCardParams = serde_json::from_str(
            r#"{
              "name": "n",
              "tool": "claude",
              "prompt": "p",
              "openclawWorkspace": true
            }"#,
        )
        .unwrap();
        assert_eq!(p.openclaw_workspace, Some(true));
    }

    #[test]
    fn params_reject_unknown_fields() {
        let res: Result<TermSessionCardParams, _> = serde_json::from_str(
            r#"{"name":"n","tool":"claude","prompt":"p","token":"nope"}"#,
        );
        assert!(res.is_err());
    }
}
