//! Authenticated `tools/call` for the stored OpenClaw workspace grant.
//! Only the project-screen tools are accepted. The bearer is never logged.

use serde::Serialize;
use serde_json::Value;

use super::load_grant;

const ALLOWED_TOOLS: &[&str] = &["list_directory", "stat_path", "read_file", "exec"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenClawToolCallResult {
    pub is_error: bool,
    pub result: Value,
}

/// Reject tools outside the project screen, and reject a non-object payload.
pub fn validate_tool_request(name: &str, arguments: &Value) -> Result<(), String> {
    if !ALLOWED_TOOLS.contains(&name) {
        return Err(format!(
            "OpenClaw tool '{name}' is not available from Buzz."
        ));
    }
    if !arguments.is_object() {
        return Err("Tool arguments must be an object.".into());
    }
    if name == "exec" {
        let argv = arguments.get("argv").and_then(Value::as_array);
        let ok = argv.is_some_and(|items| !items.is_empty() && items.iter().all(Value::is_string));
        if !ok {
            return Err("exec requires an argv array of strings.".into());
        }
    }
    Ok(())
}

/// Parse a JSON body or an SSE `data:` payload. The last JSON data line wins.
pub fn parse_mcp_payload(body: &str) -> Result<Value, String> {
    let trimmed = body.trim();
    if trimmed.starts_with('{') {
        return serde_json::from_str(trimmed)
            .map_err(|error| format!("MCP returned invalid JSON: {error}"));
    }
    let mut last = None;
    for line in trimmed.lines() {
        let Some(data) = line.trim().strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(data) {
            last = Some(value);
        }
    }
    last.ok_or_else(|| "MCP returned an empty response.".to_string())
}

/// Call one allowlisted tool with the stored grant. Does not log the bearer.
pub async fn call_tool(name: &str, arguments: Value) -> Result<OpenClawToolCallResult, String> {
    validate_tool_request(name, &arguments)?;
    let grant = load_grant()?
        .ok_or_else(|| "Not connected — no OpenClaw workspace grant is stored.".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|error| format!("failed to build HTTP client: {error}"))?;

    let session = initialize(&client, &grant).await?;
    let response = post_rpc(
        &client,
        &grant,
        session.as_deref(),
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": { "name": name, "arguments": arguments }
        }),
    )
    .await?;
    let (_session, body) = response;
    tool_result_from_body(&body)
}

fn tool_result_from_body(body: &str) -> Result<OpenClawToolCallResult, String> {
    let payload = parse_mcp_payload(body)?;
    if let Some(message) = payload
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
    {
        return Err(message.to_string());
    }
    let result = payload.get("result").cloned().unwrap_or(Value::Null);
    let is_error = result
        .get("isError")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Ok(OpenClawToolCallResult { is_error, result })
}

async fn initialize(
    client: &reqwest::Client,
    grant: &super::OpenClawWorkspaceGrant,
) -> Result<Option<String>, String> {
    let (session, body) = post_rpc(
        client,
        grant,
        None,
        serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "hula-buzz", "version": "0" }
            }
        }),
    )
    .await?;
    // A JSON-RPC error on initialize is fatal. A successful body is enough.
    let _ = tool_result_from_body(&body)?;
    let _ = post_rpc(
        client,
        grant,
        session.as_deref(),
        serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }),
    )
    .await;
    Ok(session)
}

async fn post_rpc(
    client: &reqwest::Client,
    grant: &super::OpenClawWorkspaceGrant,
    session_id: Option<&str>,
    body: Value,
) -> Result<(Option<String>, String), String> {
    let mut request = client
        .post(&grant.url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(
            reqwest::header::ACCEPT,
            "application/json, text/event-stream",
        )
        .header(reqwest::header::AUTHORIZATION, grant.authorization.as_str())
        .header("mcp-protocol-version", "2024-11-05");
    if let Some(session_id) = session_id {
        request = request.header("mcp-session-id", session_id);
    }
    if let Some(headers) = &grant.headers {
        for (key, value) in headers {
            if key.eq_ignore_ascii_case("authorization") {
                continue;
            }
            request = request.header(key.as_str(), value.as_str());
        }
    }

    let response = request
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("MCP request failed: {error}"))?;
    let status = response.status();
    let session = response
        .headers()
        .get("mcp-session-id")
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err(
            "MCP rejected credentials. Refresh the OpenClaw connection and try again.".to_string(),
        );
    }
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        let snippet: String = text.chars().take(160).collect();
        let detail = if snippet.trim().is_empty() {
            String::new()
        } else {
            format!(": {snippet}")
        };
        return Err(format!("MCP returned HTTP {}{detail}", status.as_u16()));
    }
    Ok((session, text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_tools_are_the_only_calls() {
        assert!(validate_tool_request("stat_path", &serde_json::json!({})).is_ok());
        assert!(validate_tool_request("write_file", &serde_json::json!({})).is_err());
        assert!(validate_tool_request("stat_path", &serde_json::json!([])).is_err());
        assert!(validate_tool_request(
            "exec",
            &serde_json::json!({ "argv": ["git", "status", "-sb"] })
        )
        .is_ok());
        assert!(
            validate_tool_request("exec", &serde_json::json!({ "argv": "git status" })).is_err()
        );
    }

    #[test]
    fn json_and_sse_payloads_parse() {
        let json = parse_mcp_payload(r#"{"jsonrpc":"2.0","id":2,"result":{"ok":true}}"#).unwrap();
        assert_eq!(json["result"]["ok"], true);

        let sse = parse_mcp_payload(
            "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"isError\":false}}\n\n",
        )
        .unwrap();
        assert_eq!(sse["result"]["isError"], false);
    }

    #[test]
    fn tool_error_flag_is_preserved() {
        let parsed = tool_result_from_body(
            r#"{"jsonrpc":"2.0","id":2,"result":{"isError":true,"content":[{"type":"text","text":"ENOENT"}]}}"#,
        )
        .unwrap();
        assert!(parsed.is_error);
        assert_eq!(parsed.result["content"][0]["text"], "ENOENT");
    }

    #[test]
    fn jsonrpc_error_is_returned() {
        let error = tool_result_from_body(
            r#"{"jsonrpc":"2.0","id":2,"error":{"code":-32602,"message":"bad args"}}"#,
        )
        .unwrap_err();
        assert_eq!(error, "bad args");
    }
}
