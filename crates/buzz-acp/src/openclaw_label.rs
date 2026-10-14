//! Label OpenClaw Gateway sessions from buzz-acp.
//!
//! OpenClaw's ACP bridge ignores `_meta.sessionTitle`, and no OpenClaw agent
//! tool can set a session label (`sessions_*` tools are list/history/send/
//! spawn/yield only). Asking the agent to rename itself never worked. Instead
//! buzz-acp runs `openclaw gateway call sessions.patch` with the same CLI the
//! agent was launched with, so the Gateway's local auth applies and no token
//! passes through buzz-acp. Best-effort: failures are logged and ignored.

use uuid::Uuid;

/// `agentInfo.name` reported by `openclaw acp`.
pub(crate) const OPENCLAW_ACP_NAME: &str = "openclaw-acp";

/// Label shown in the Control UI sidebar. DMs have no channel name in the
/// title, so they get `DM <channel-prefix>` to stay distinct per DM.
pub(crate) fn session_label(
    title: &str,
    channel_type: Option<&str>,
    channel_id: Option<Uuid>,
) -> String {
    let title = title.trim();
    match (channel_type, channel_id) {
        (Some("dm"), Some(id)) => format!("{title} DM {}", &id.simple().to_string()[..8]),
        _ => title.to_string(),
    }
}

fn patch_params(key: &str, label: &str) -> String {
    serde_json::json!({ "key": key, "label": label }).to_string()
}

fn run_patch(cli: &[String], key: &str, label: &str) -> Result<(), String> {
    let (cmd, prefix) = cli.split_first().ok_or("empty openclaw cli")?;
    let out = std::process::Command::new(cmd)
        .args(prefix)
        .args([
            "gateway",
            "call",
            "sessions.patch",
            "--json",
            "--timeout",
            "10000",
            "--params",
        ])
        .arg(patch_params(key, label))
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        let mut msg = String::from_utf8_lossy(&out.stderr).into_owned();
        msg.push_str(&String::from_utf8_lossy(&out.stdout));
        Err(msg.chars().take(300).collect())
    }
}

/// Fire-and-forget label patch. On "label already in use", retries once with
/// a key suffix so two sessions sharing a title still both get labeled.
pub(crate) fn spawn_set_label(cli: Vec<String>, key: String, label: String) {
    tokio::task::spawn_blocking(move || {
        let result = match run_patch(&cli, &key, &label) {
            Err(e) if e.contains("already in use") => {
                let tail: String = key
                    .chars()
                    .rev()
                    .take(8)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect();
                run_patch(&cli, &key, &format!("{label} ({tail})"))
            }
            other => other,
        };
        match result {
            Ok(()) => {
                tracing::info!(target: "pool::session", "labeled OpenClaw session {key} as {label:?}")
            }
            Err(e) => {
                tracing::warn!(target: "pool::session", "could not label OpenClaw session {key}: {e}")
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dm_label_gets_channel_prefix() {
        let id = Uuid::parse_str("de2d83c2-ec1e-4879-93c8-df233268448f").unwrap();
        assert_eq!(session_label("te", Some("dm"), Some(id)), "te DM de2d83c2");
        assert_eq!(
            session_label("buzz #lilo", Some("stream"), Some(id)),
            "buzz #lilo"
        );
    }

    #[test]
    fn params_are_json() {
        let v: serde_json::Value =
            serde_json::from_str(&patch_params("agent:mo:buzz", "a \"b\"")).unwrap();
        assert_eq!(v["label"], "a \"b\"");
    }
}
