//! Drive action helpers (JS payloads executed in the granted webview).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveAction {
    pub kind: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub selector: Option<String>,
    #[serde(default)]
    pub dx: Option<f64>,
    #[serde(default)]
    pub dy: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveActionResult {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

pub fn action_js(action: &DriveAction) -> Result<String, String> {
    let kind = action.kind.trim().to_ascii_lowercase();
    match kind.as_str() {
        "click" => {
            let x = action.x.ok_or_else(|| "click requires x".to_string())?;
            let y = action.y.ok_or_else(|| "click requires y".to_string())?;
            Ok(format!(
                r#"(function(){{var a=window.__buzzBrowserAgent;if(!a)return;a.clickAt({x},{y});}})();"#
            ))
        }
        "hover" => {
            let x = action.x.ok_or_else(|| "hover requires x".to_string())?;
            let y = action.y.ok_or_else(|| "hover requires y".to_string())?;
            Ok(format!(
                r#"(function(){{var a=window.__buzzBrowserAgent;if(!a)return;a.moveCursor({x},{y},false);}})();"#
            ))
        }
        "type" => {
            let text = action
                .text
                .as_deref()
                .ok_or_else(|| "type requires text".to_string())?;
            let text_js = serde_json::to_string(text).map_err(|e| e.to_string())?;
            let selector_js = match &action.selector {
                Some(s) => serde_json::to_string(s).map_err(|e| e.to_string())?,
                None => "null".into(),
            };
            Ok(format!(
                r#"(function(){{var a=window.__buzzBrowserAgent;if(!a)return;a.typeText({text_js},{selector_js});}})();"#
            ))
        }
        "scroll" => {
            let dx = action.dx.unwrap_or(0.0);
            let dy = action.dy.unwrap_or(0.0);
            Ok(format!(
                r#"(function(){{var a=window.__buzzBrowserAgent;if(!a)return;a.scrollBy({dx},{dy});}})();"#
            ))
        }
        "navigate" => Err("navigate is handled by the host".into()),
        other => Err(format!("unknown drive action: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn click_js_includes_coordinates() {
        let js = action_js(&DriveAction {
            kind: "click".into(),
            url: None,
            x: Some(10.0),
            y: Some(20.0),
            text: None,
            selector: None,
            dx: None,
            dy: None,
        })
        .unwrap();
        assert!(js.contains("clickAt(10,20)"));
    }

    #[test]
    fn navigate_deferred_to_host() {
        assert!(action_js(&DriveAction {
            kind: "navigate".into(),
            url: Some("https://example.com".into()),
            x: None,
            y: None,
            text: None,
            selector: None,
            dx: None,
            dy: None,
        })
        .unwrap_err()
        .contains("host"));
    }
}
