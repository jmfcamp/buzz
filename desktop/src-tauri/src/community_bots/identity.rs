//! Read Buzz **public** identities from live OpenClaw gateway methods.
//!
//! Official methods used here (do not invent RPCs):
//! - `channels.status` — Buzz account snapshots include `publicKey`
//! - `config.get` — only if a `publicKey` field is present after secrets are
//!   stripped. `privateKey` / tokens / nsec / SecretRef are never stored,
//!   logged, or treated as an identity.
//!
//! `directory.self` is a CLI adapter, not a confirmed gateway method.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::protocol::{first_hex_pubkey, first_string, normalize_hex_pubkey, RemoteAgent};

/// One Buzz account public identity on the VPS gateway.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuzzIdentity {
    /// OpenClaw Buzz account id (`default`, or a named account).
    pub account_id: String,
    /// 64-character hex public key. Never an nsec.
    pub pubkey: String,
}

/// Identity used when installing a remote agent as a member.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedBotIdentity {
    /// Hex pubkey to add as a community member.
    pub pubkey: String,
    /// Always false on the VPS path — this desktop never mints an nsec.
    pub minted: bool,
}

/// Keys whose values must never leave the gateway response as usable data.
const SECRET_KEY_MARKERS: &[&str] = &[
    "privatekey",
    "password",
    "token",
    "nsec",
    "secret",
    "authtag",
    "secretref",
    "devicetoken",
    "bootstrapToken",
    "bootstraptoken",
];

/// Public-identity field names. Order matches OpenClaw snapshot extras.
const PUBKEY_KEYS: &[&str] = &["publicKey", "public_key", "pubkey"];

/// Error when Install has no VPS Buzz pubkey and the admin did not paste one.
pub fn missing_buzz_account_message(agent_id: &str) -> String {
    format!(
        "This OpenClaw agent has no Buzz account yet. On the VPS run: openclaw channels add --channel buzz --account {agent_id}"
    )
}

/// Whether a config/object key names a secret (never persist or log).
pub fn is_secret_config_key(key: &str) -> bool {
    let normalized = key
        .chars()
        .filter(|ch| *ch != '_' && *ch != '-')
        .collect::<String>()
        .to_ascii_lowercase();
    SECRET_KEY_MARKERS
        .iter()
        .any(|marker| normalized.contains(marker))
}

/// True when a JSON object looks like an OpenClaw SecretRef (`env`/`file`/`exec`).
pub fn looks_like_secret_ref(value: &Value) -> bool {
    let Some(object) = value.as_object() else {
        return false;
    };
    let source = object
        .get("source")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(source.as_str(), "env" | "file" | "exec")
}

/// Drop secret keys, SecretRef objects, nsec strings, and redaction sentinels.
///
/// The returned tree is the only view Install may inspect. The original
/// `config.get` payload must not be stored, logged, or sent to the relay.
pub fn strip_config_secrets(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut cleaned = serde_json::Map::new();
            for (key, child) in map {
                if is_secret_config_key(key) || looks_like_secret_ref(child) {
                    continue;
                }
                if let Value::String(text) = child {
                    if looks_like_secret_string(text) {
                        continue;
                    }
                }
                cleaned.insert(key.clone(), strip_config_secrets(child));
            }
            Value::Object(cleaned)
        }
        Value::Array(items) => Value::Array(items.iter().map(strip_config_secrets).collect()),
        other => other.clone(),
    }
}

fn looks_like_secret_string(value: &str) -> bool {
    let trimmed = value.trim();
    let lower = trimmed.to_ascii_lowercase();
    lower.starts_with("nsec1")
        || lower.contains("__openclaw_redacted__")
        || lower.contains("openclaw_redacted")
}

fn hex_pubkey_from_object(value: &Value) -> Option<String> {
    first_hex_pubkey(value, PUBKEY_KEYS)
}

fn account_id_from(value: &Value, fallback: &str) -> String {
    first_string(value, &["accountId", "account_id", "id", "name"])
        .filter(|id| !id.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn push_identity(out: &mut Vec<BuzzIdentity>, account_id: String, pubkey: String) {
    if out
        .iter()
        .any(|existing| existing.account_id == account_id && existing.pubkey == pubkey)
    {
        return;
    }
    out.push(BuzzIdentity { account_id, pubkey });
}

fn collect_identity_from_object(
    out: &mut Vec<BuzzIdentity>,
    value: &Value,
    fallback_account: &str,
) {
    if let Some(pubkey) = hex_pubkey_from_object(value) {
        push_identity(out, account_id_from(value, fallback_account), pubkey);
    }
    if let Some(probe) = value.get("probe") {
        if let Some(pubkey) = hex_pubkey_from_object(probe) {
            push_identity(out, account_id_from(value, fallback_account), pubkey);
        }
    }
    if let Some(identity) = value.get("identity") {
        if let Some(pubkey) = hex_pubkey_from_object(identity) {
            push_identity(out, account_id_from(value, fallback_account), pubkey);
        }
    }
}

fn collect_from_account_list(out: &mut Vec<BuzzIdentity>, accounts: &Value, fallback: &str) {
    match accounts {
        Value::Array(items) => {
            for item in items {
                collect_identity_from_object(out, item, fallback);
            }
        }
        Value::Object(map) => {
            for (account_id, item) in map {
                if is_secret_config_key(account_id) {
                    continue;
                }
                collect_identity_from_object(out, item, account_id);
            }
        }
        _ => {}
    }
}

fn buzz_node<'a>(root: &'a Value) -> Option<&'a Value> {
    if let Some(buzz) = root.pointer("/channelAccounts/buzz") {
        return Some(buzz);
    }
    if let Some(buzz) = root.pointer("/channels/buzz") {
        return Some(buzz);
    }
    if let Some(buzz) = root.pointer("/config/channels/buzz") {
        return Some(buzz);
    }
    if let Some(buzz) = root.get("buzz") {
        return Some(buzz);
    }
    None
}

/// Collect Buzz hex pubkeys from a `channels.status` payload.
pub fn extract_buzz_identities_from_status(payload: &Value) -> Vec<BuzzIdentity> {
    let mut out = Vec::new();
    if let Some(accounts) = payload.pointer("/channelAccounts/buzz") {
        collect_from_account_list(&mut out, accounts, "default");
    }
    if let Some(channel) = payload.pointer("/channels/buzz") {
        collect_identity_from_object(&mut out, channel, "default");
        if let Some(accounts) = channel.get("accounts") {
            collect_from_account_list(&mut out, accounts, "default");
        }
        if let Some(accounts) = channel.get("channelAccounts") {
            collect_from_account_list(&mut out, accounts, "default");
        }
    }
    out
}

/// Collect Buzz hex pubkeys from a secret-stripped `config.get` payload.
///
/// Never reads `privateKey`. If the gateway redacts that field, only an
/// existing `publicKey` (or nested identity/publicKey) is used.
pub fn extract_buzz_identities_from_config(config: &Value) -> Vec<BuzzIdentity> {
    let cleaned = strip_config_secrets(config);
    let mut out = Vec::new();
    let Some(buzz) = buzz_node(&cleaned).cloned().or_else(|| {
        cleaned
            .get("config")
            .and_then(|inner| inner.pointer("/channels/buzz"))
            .cloned()
    }) else {
        return out;
    };
    collect_identity_from_object(&mut out, &buzz, "default");
    if let Some(accounts) = buzz.get("accounts") {
        collect_from_account_list(&mut out, accounts, "default");
    }
    out
}

/// Prefer `channels.status`, then a stripped `config.get`.
pub fn merge_buzz_identity_sources(
    status: Option<&Value>,
    config: Option<&Value>,
) -> Vec<BuzzIdentity> {
    let mut out = Vec::new();
    if let Some(payload) = status {
        out.extend(extract_buzz_identities_from_status(payload));
    }
    if out.is_empty() {
        if let Some(payload) = config {
            out.extend(extract_buzz_identities_from_config(payload));
        }
    }
    out
}

/// Bind VPS Buzz pubkeys onto `agents.list` rows.
///
/// Named Buzz accounts win when `accountId` matches the agent id. Otherwise
/// the default (or only) identity is attached so remote agents are routing
/// names, not separately minted members.
pub fn attach_buzz_identities(agents: &mut [RemoteAgent], identities: &[BuzzIdentity]) {
    if identities.is_empty() {
        return;
    }
    let default_pubkey = identities
        .iter()
        .find(|identity| identity.account_id == "default")
        .or_else(|| identities.first())
        .map(|identity| identity.pubkey.clone());

    for agent in agents.iter_mut() {
        if agent.pubkey.is_some() {
            continue;
        }
        if let Some(matched) = identities.iter().find(|identity| {
            identity.account_id == agent.id
                || identity.account_id.eq_ignore_ascii_case(agent.id.trim())
        }) {
            agent.pubkey = Some(matched.pubkey.clone());
            continue;
        }
        if let Some(pubkey) = default_pubkey.as_ref() {
            agent.pubkey = Some(pubkey.clone());
        }
    }
}

/// Resolve the Install identity from a confirmed public hex only.
///
/// Never mints or reads a stored nsec. `provided` must already be a 64-char
/// hex pubkey (from the VPS snapshot or an admin paste).
pub fn resolve_vps_bot_identity(
    agent_id: &str,
    provided: Option<&str>,
) -> Result<ResolvedBotIdentity, String> {
    let agent_id = agent_id.trim();
    if agent_id.is_empty() {
        return Err("agent id is required".into());
    }
    if let Some(hex) = provided.and_then(normalize_hex_pubkey) {
        return Ok(ResolvedBotIdentity {
            pubkey: hex,
            minted: false,
        });
    }
    Err(missing_buzz_account_message(agent_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const VPS: &str = "22aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const ADA: &str = "33bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    #[test]
    fn status_reads_channel_account_public_key() {
        let payload = json!({
            "channelAccounts": {
                "buzz": [
                    { "accountId": "default", "publicKey": VPS, "name": "OpenClaw" }
                ]
            }
        });
        let identities = extract_buzz_identities_from_status(&payload);
        assert_eq!(identities.len(), 1);
        assert_eq!(identities[0].account_id, "default");
        assert_eq!(identities[0].pubkey, VPS);
    }

    #[test]
    fn status_reads_probe_and_named_accounts() {
        let payload = json!({
            "channelAccounts": {
                "buzz": [
                    { "accountId": "default", "probe": { "ok": true, "publicKey": VPS } },
                    { "accountId": "ada", "publicKey": ADA }
                ]
            }
        });
        let identities = extract_buzz_identities_from_status(&payload);
        assert_eq!(identities.len(), 2);
        assert_eq!(identities[1].account_id, "ada");
        assert_eq!(identities[1].pubkey, ADA);
    }

    #[test]
    fn config_get_ignores_private_key_token_password_nsec_and_secret_ref() {
        let config = json!({
            "channels": {
                "buzz": {
                    "privateKey": "nsec1notallowed",
                    "password": "gateway-password",
                    "token": "user-token",
                    "authTag": { "source": "env", "id": "BUZZ_AUTH_TAG" },
                    "accounts": {
                        "default": {
                            "privateKey": "aa".repeat(32),
                            "publicKey": VPS
                        }
                    }
                }
            }
        });
        let cleaned = strip_config_secrets(&config);
        let blob = cleaned.to_string();
        assert!(!blob.contains("nsec1"), "{blob}");
        assert!(!blob.contains("gateway-password"), "{blob}");
        assert!(!blob.contains("user-token"), "{blob}");
        assert!(!blob.contains("BUZZ_AUTH_TAG"), "{blob}");
        assert!(!blob.contains(&"aa".repeat(32)), "{blob}");
        assert!(blob.contains(VPS), "{blob}");

        let identities = extract_buzz_identities_from_config(&config);
        assert_eq!(identities.len(), 1);
        assert_eq!(identities[0].pubkey, VPS);
        assert_ne!(identities[0].pubkey, "aa".repeat(32));
    }

    #[test]
    fn config_get_without_public_key_does_not_invent_one() {
        let config = json!({
            "config": {
                "channels": {
                    "buzz": {
                        "privateKey": "__OPENCLAW_REDACTED__",
                        "relayUrl": "wss://stitch.hulahealth.com"
                    }
                }
            }
        });
        assert!(extract_buzz_identities_from_config(&config).is_empty());
    }

    #[test]
    fn prefers_status_over_config() {
        let status = json!({
            "channelAccounts": { "buzz": [{ "accountId": "default", "publicKey": VPS }] }
        });
        let config = json!({
            "channels": { "buzz": { "publicKey": ADA } }
        });
        let identities = merge_buzz_identity_sources(Some(&status), Some(&config));
        assert_eq!(identities.len(), 1);
        assert_eq!(identities[0].pubkey, VPS);
    }

    #[test]
    fn attaches_default_identity_to_agents_without_their_own_key() {
        let mut agents = vec![
            RemoteAgent {
                id: "mo".into(),
                name: "Mo".into(),
                pubkey: None,
            },
            RemoteAgent {
                id: "captain".into(),
                name: "Captain".into(),
                pubkey: None,
            },
            RemoteAgent {
                id: "ada".into(),
                name: "Ada".into(),
                pubkey: None,
            },
        ];
        attach_buzz_identities(
            &mut agents,
            &[
                BuzzIdentity {
                    account_id: "default".into(),
                    pubkey: VPS.to_string(),
                },
                BuzzIdentity {
                    account_id: "ada".into(),
                    pubkey: ADA.to_string(),
                },
            ],
        );
        assert_eq!(agents[0].pubkey.as_deref(), Some(VPS));
        assert_eq!(agents[1].pubkey.as_deref(), Some(VPS));
        assert_eq!(agents[2].pubkey.as_deref(), Some(ADA));
    }

    #[test]
    fn resolve_uses_public_hex_and_never_mints() {
        let resolved = resolve_vps_bot_identity("mo", Some(VPS)).expect("pubkey");
        assert_eq!(resolved.pubkey, VPS);
        assert!(!resolved.minted);
        let error = resolve_vps_bot_identity("mo", None).expect_err("missing");
        assert!(error.contains("openclaw channels add --channel buzz --account mo"));
        assert!(resolve_vps_bot_identity("mo", Some("nsec1notapubkey")).is_err());
    }
}
