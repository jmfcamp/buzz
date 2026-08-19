//! On-demand Buzz account secret lookup from live OpenClaw methods.
//!
//! Official methods investigated:
//! - `config.get` — the only RPC that can contain `channels.buzz.privateKey`.
//!   Current OpenClaw redacts it to `__OPENCLAW_REDACTED__`.
//! - `secrets.store.list` — values only for `kind: "env"` store entries; no
//!   reveal for `kind: "secret"`. Not a Buzz-account export.
//! - `secrets.resolve` — command-target SecretRefs, closed target registry.
//!
//! There is no dedicated reveal RPC. If `config.get` still returns a parseable
//! Buzz `privateKey` (older gateways), it is converted to nsec and matched to
//! the requested pubkey. Password / token / device token are never treated as
//! bot identity. The payload is never logged or stored.

use nostr::{FromBech32, Keys, SecretKey, ToBech32};
use serde::Serialize;
use serde_json::Value;

use super::protocol::normalize_hex_pubkey;

/// Shown when the gateway withholds or redacts the Buzz account secret.
pub const VPS_SECRET_UNAVAILABLE: &str =
    "Private key stays on the VPS; the gateway did not return it.";

const PRIVATE_KEY_KEYS: &[&str] = &["privateKey", "private_key"];

/// Result of an on-demand reveal. `nsec` is present only when a Buzz account
/// secret matching `pubkey` was parsed. Never includes gateway password/token.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RevealedBotSecret {
    /// Bech32 nsec when the VPS returned a usable Buzz account secret.
    pub nsec: Option<String>,
    /// Set when no usable secret was returned.
    pub unavailable_reason: Option<String>,
}

impl RevealedBotSecret {
    /// Usable nsec for the requested pubkey.
    pub fn found(nsec: String) -> Self {
        Self {
            nsec: Some(nsec),
            unavailable_reason: None,
        }
    }

    /// Gateway withheld or redacted the Buzz private key.
    pub fn unavailable() -> Self {
        Self {
            nsec: None,
            unavailable_reason: Some(VPS_SECRET_UNAVAILABLE.to_string()),
        }
    }
}

fn is_redacted_secret_string(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.contains("openclaw_redacted") || lower.contains("__openclaw_redacted__")
}

fn parse_nostr_secret(value: &str) -> Option<Keys> {
    let trimmed = value.trim();
    if trimmed.is_empty() || is_redacted_secret_string(trimmed) {
        return None;
    }
    if trimmed.to_ascii_lowercase().starts_with("nsec1") {
        return SecretKey::from_bech32(trimmed).ok().map(Keys::new);
    }
    if normalize_hex_pubkey(trimmed).is_some() {
        return SecretKey::from_hex(trimmed).ok().map(Keys::new);
    }
    None
}

fn keys_to_nsec(keys: &Keys) -> Option<String> {
    keys.secret_key().to_bech32().ok()
}

fn push_private_key_candidate(out: &mut Vec<String>, saw_redacted: &mut bool, value: &Value) {
    match value {
        Value::String(text) => {
            if is_redacted_secret_string(text) {
                *saw_redacted = true;
                return;
            }
            if parse_nostr_secret(text).is_some() {
                out.push(text.clone());
            }
        }
        Value::Object(_) => {
            // SecretRef (`env`/`file`/`exec`) is not a revealable nsec.
        }
        _ => {}
    }
}

fn collect_from_buzz_object(out: &mut Vec<String>, saw_redacted: &mut bool, buzz: &Value) {
    if let Some(object) = buzz.as_object() {
        for key in PRIVATE_KEY_KEYS {
            if let Some(value) = object.get(*key) {
                push_private_key_candidate(out, saw_redacted, value);
            }
        }
    }
    if let Some(accounts) = buzz.get("accounts") {
        match accounts {
            Value::Object(map) => {
                for (account_id, item) in map {
                    if account_id.eq_ignore_ascii_case("privatekey")
                        || account_id.eq_ignore_ascii_case("password")
                        || account_id.eq_ignore_ascii_case("token")
                    {
                        continue;
                    }
                    collect_from_buzz_object(out, saw_redacted, item);
                }
            }
            Value::Array(items) => {
                for item in items {
                    collect_from_buzz_object(out, saw_redacted, item);
                }
            }
            _ => {}
        }
    }
}

fn buzz_config_nodes(root: &Value) -> Vec<&Value> {
    const PATHS: &[&str] = &[
        "/channels/buzz",
        "/config/channels/buzz",
        "/parsed/channels/buzz",
        "/resolved/channels/buzz",
        "/sourceConfig/channels/buzz",
        "/runtimeConfig/channels/buzz",
    ];
    let mut nodes = Vec::new();
    for path in PATHS {
        if let Some(node) = root.pointer(path) {
            nodes.push(node);
        }
    }
    nodes
}

/// Pull a Buzz account nsec from a `config.get` payload when present.
///
/// Only `channels.buzz.privateKey` (and named `accounts.*.privateKey`) are
/// considered. Gateway password/token fields are ignored. The returned nsec
/// must derive `expected_pubkey`.
pub fn extract_buzz_account_secret(config: &Value, expected_pubkey: &str) -> RevealedBotSecret {
    let Some(expected) = normalize_hex_pubkey(expected_pubkey) else {
        return RevealedBotSecret::unavailable();
    };
    let mut candidates = Vec::new();
    let mut saw_redacted = false;
    for node in buzz_config_nodes(config) {
        collect_from_buzz_object(&mut candidates, &mut saw_redacted, node);
    }
    for raw in candidates {
        if let Some(keys) = parse_nostr_secret(&raw) {
            if keys.public_key().to_hex() == expected {
                if let Some(nsec) = keys_to_nsec(&keys) {
                    return RevealedBotSecret::found(nsec);
                }
            }
        }
    }
    let _ = saw_redacted;
    RevealedBotSecret::unavailable()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn pair() -> (Keys, String, String) {
        let keys = Keys::generate();
        let nsec = keys.secret_key().to_bech32().expect("nsec");
        let pubkey = keys.public_key().to_hex();
        (keys, nsec, pubkey)
    }

    #[test]
    fn extracts_nsec_private_key_for_matching_pubkey() {
        let (_keys, nsec, pubkey) = pair();
        let config = json!({
            "channels": { "buzz": { "privateKey": nsec } }
        });
        let revealed = extract_buzz_account_secret(&config, &pubkey);
        assert_eq!(revealed.nsec.as_deref(), Some(nsec.as_str()));
        assert_eq!(revealed.unavailable_reason, None);
    }

    #[test]
    fn extracts_hex_private_key_and_returns_nsec() {
        let (keys, nsec, pubkey) = pair();
        let hex = keys.secret_key().to_secret_hex();
        let config = json!({
            "config": {
                "channels": {
                    "buzz": {
                        "accounts": {
                            "mo": { "privateKey": hex }
                        }
                    }
                }
            }
        });
        let revealed = extract_buzz_account_secret(&config, &pubkey);
        assert_eq!(revealed.nsec.as_deref(), Some(nsec.as_str()));
    }

    #[test]
    fn ignores_password_token_and_redacted_private_key() {
        let (_keys, _nsec, pubkey) = pair();
        let config = json!({
            "channels": {
                "buzz": {
                    "privateKey": "__OPENCLAW_REDACTED__",
                    "password": "gateway-password",
                    "token": "device-token"
                }
            },
            "gateway": { "remote": { "password": "gateway-password" } }
        });
        let revealed = extract_buzz_account_secret(&config, &pubkey);
        assert_eq!(revealed, RevealedBotSecret::unavailable());
        assert!(revealed.nsec.is_none());
        assert_eq!(
            revealed.unavailable_reason.as_deref(),
            Some(VPS_SECRET_UNAVAILABLE)
        );
    }

    #[test]
    fn does_not_return_a_secret_for_a_different_pubkey() {
        let (_keys, nsec, _pubkey) = pair();
        let other = Keys::generate().public_key().to_hex();
        let config = json!({
            "channels": { "buzz": { "privateKey": nsec } }
        });
        let revealed = extract_buzz_account_secret(&config, &other);
        assert_eq!(revealed, RevealedBotSecret::unavailable());
    }

    #[test]
    fn ignores_secret_ref_objects() {
        let pubkey = "22".repeat(32);
        let config = json!({
            "channels": {
                "buzz": {
                    "privateKey": { "source": "env", "id": "BUZZ_PRIVATE_KEY" }
                }
            }
        });
        assert_eq!(
            extract_buzz_account_secret(&config, &pubkey),
            RevealedBotSecret::unavailable()
        );
    }
}
